import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import type { AuthUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { countAdjustment, receptionOutcome } from "../domain";
import { nextFolio } from "../folio";

type RequestLineInput = { productId: string; quantity: string; notes?: string };
type TransferLineInput = {
  productId: string;
  sentQuantity: string;
  supplyRequestLineId?: string;
};
type ReceptionLineInput = {
  lineId: string;
  receivedQuantity: string;
  damaged?: boolean;
  reason?: string;
  notes?: string;
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService
  ) {}

  async dashboard(user: AuthUser, requestedLocationId?: string) {
    const locationId = this.scopedLocation(user, requestedLocationId);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [
      pendingRequests,
      partialRequests,
      preparingTransfers,
      inRoute,
      pendingReceipts,
      openIncidents,
      resolvedIncidentsThisWeek,
      activeCount,
      countsCompletedToday,
      receivedLast30,
      receivedWithDifferencesLast30
    ] = await Promise.all([
      this.prisma.supplyRequest.count({ where: { locationId, status: "PENDING" } }),
      this.prisma.supplyRequest.count({ where: { locationId, status: "PARTIAL" } }),
      this.prisma.transfer.count({
        where: { destinationLocationId: locationId, status: { in: ["DRAFT", "PREPARING"] } }
      }),
      this.prisma.transfer.count({
        where: user.role === "DRIVER"
          ? { driverUserId: user.id, status: "IN_ROUTE" }
          : { destinationLocationId: locationId, status: "IN_ROUTE" }
      }),
      this.prisma.transfer.count({
        where: { destinationLocationId: locationId, status: "DELIVERED" }
      }),
      this.prisma.incident.count({ where: { locationId, status: "OPEN" } }),
      this.prisma.incident.count({
        where: { locationId, status: "RESOLVED", resolvedAt: { gte: startOfWeek } }
      }),
      this.prisma.stockCount.findFirst({
        where: { locationId, status: "IN_PROGRESS" },
        include: { _count: { select: { lines: true } }, lines: { select: { status: true } } }
      }),
      this.prisma.stockCount.count({
        where: { locationId, status: "COMPLETED", completedAt: { gte: startOfToday } }
      }),
      this.prisma.transfer.count({
        where: {
          destinationLocationId: locationId,
          status: { in: ["RECEIVED", "RECEIVED_WITH_DIFFERENCES"] },
          receivedAt: { gte: startOfWeek }
        }
      }),
      this.prisma.transfer.count({
        where: {
          destinationLocationId: locationId,
          status: "RECEIVED_WITH_DIFFERENCES",
          receivedAt: { gte: startOfWeek }
        }
      })
    ]);

    const accuracyRate = receivedLast30 > 0
      ? Math.round(((receivedLast30 - receivedWithDifferencesLast30) / receivedLast30) * 100)
      : 100;

    return {
      pendingRequests,
      partialRequests,
      preparingTransfers,
      inRoute,
      pendingReceipts,
      openIncidents,
      resolvedIncidentsThisWeek,
      countsCompletedToday,
      accuracyRate,
      receivedLast30,
      receivedWithDifferencesLast30,
      activeCount: activeCount
        ? {
            id: activeCount.id,
            total: activeCount._count.lines,
            completed: activeCount.lines.filter((line) => line.status === "COUNTED").length
          }
        : null
    };
  }

  listCounts(user: AuthUser, requestedLocationId?: string) {
    return this.prisma.stockCount.findMany({
      where: { locationId: this.scopedLocation(user, requestedLocationId) },
      include: {
        location: true,
        startedBy: { select: { id: true, name: true } },
        _count: { select: { lines: true } }
      },
      orderBy: { startedAt: "desc" }
    });
  }

  async startCount(user: AuthUser, locationId: string, notes?: string) {
    this.assertLocation(user, locationId);
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.stockCount.findFirst({
        where: { locationId, status: "IN_PROGRESS" }
      });
      if (active) throw new ConflictException("Ya existe un conteo en progreso");
      // El catálogo es único para toda la empresa: cada sucursal cuenta todos
      // los productos activos y guarda su propio stock.
      const catalog = await tx.product.findMany({
        where: { active: true },
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      });
      if (!catalog.length) throw new BadRequestException("El catálogo no tiene productos activos");
      const balances = await tx.inventoryBalance.findMany({ where: { locationId } });
      const byProduct = new Map(balances.map((balance) => [balance.productId, balance]));
      return tx.stockCount.create({
        data: {
          folio: await nextFolio(tx, "CON"),
          locationId,
          startedByUserId: user.id,
          notes,
          lines: {
            create: catalog.map(({ id: productId }) => ({
              productId,
              snapshotQuantity: byProduct.get(productId)?.quantity ?? 0,
              movementVersionAtCount: byProduct.get(productId)?.version ?? 0
            }))
          }
        },
        include: {
          location: true,
          lines: { include: { product: { include: { unit: true, category: true } } } }
        }
      });
    });
  }

  async getCount(user: AuthUser, id: string) {
    const count = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        location: true,
        lines: {
          include: { product: { include: { unit: true, category: true } } },
          orderBy: { product: { name: "asc" } }
        }
      }
    });
    if (!count) throw new NotFoundException("Conteo no encontrado");
    this.assertLocation(user, count.locationId);
    return count;
  }

  async updateCountLine(
    user: AuthUser,
    countId: string,
    lineId: string,
    quantity: string,
    version: number,
    clientMutationId: string,
    notes?: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const line = await tx.stockCountLine.findUnique({
        where: { id: lineId },
        include: { stockCount: true }
      });
      if (!line || line.stockCountId !== countId) throw new NotFoundException("Producto no encontrado");
      this.assertLocation(user, line.stockCount.locationId);
      if (line.stockCount.status !== "IN_PROGRESS") {
        throw new ConflictException("El conteo ya no admite cambios");
      }
      const duplicate = await tx.countLineMutation.findUnique({
        where: { stockCountLineId_clientMutationId: { stockCountLineId: lineId, clientMutationId } }
      });
      if (duplicate) return tx.stockCountLine.findUnique({ where: { id: lineId } });

      const updated = await tx.stockCountLine.updateMany({
        where: { id: lineId, version },
        data: {
          countedQuantity: new Prisma.Decimal(quantity),
          countedAt: new Date(),
          countedByUserId: user.id,
          status: "COUNTED",
          countNotes: notes,
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        const currentState = await tx.stockCountLine.findUnique({ where: { id: lineId } });
        throw new ConflictException({ message: "La cantidad cambió en otro dispositivo", currentState });
      }
      await tx.countLineMutation.create({
        data: { stockCountLineId: lineId, clientMutationId }
      });
      return tx.stockCountLine.findUnique({ where: { id: lineId } });
    });
  }

  async preCompleteCount(user: AuthUser, id: string) {
    const count = await this.prisma.stockCount.findUnique({
      where: { id },
      include: { lines: { include: { product: true } } }
    });
    if (!count) throw new NotFoundException("Conteo no encontrado");
    this.assertLocation(user, count.locationId);

    if (count.status !== "IN_PROGRESS") {
      throw new ConflictException("El conteo ya fue procesado");
    }

    const pending = count.lines.filter((line) => line.countedQuantity === null);
    const adjustments = count.lines
      .filter((line) => line.countedQuantity !== null)
      .map((line) => {
        const delta = countAdjustment(line.snapshotQuantity, line.countedQuantity!);
        return {
          productId: line.productId,
          productName: line.product.name,
          delta,
          newBalance: line.snapshotQuantity.plus(delta)
        };
      })
      .filter((adj) => !adj.delta.isZero());

    return {
      valid: pending.length === 0,
      adjustments,
      issues: pending.map((line) => `Producto ${line.product.name} aún no contado`)
    };
  }

  async completeCount(user: AuthUser, id: string, key: string) {
    if (!key) throw new BadRequestException("Idempotency-Key es obligatorio");
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.previousResponse(tx, user.id, "COMPLETE_COUNT", key);
      if (previous) return previous;
      const count = await tx.stockCount.findUnique({ where: { id }, include: { lines: true } });
      if (!count) throw new NotFoundException("Conteo no encontrado");
      this.assertLocation(user, count.locationId);
      if (count.status !== "IN_PROGRESS") throw new ConflictException("El conteo ya fue procesado");
      if (count.lines.some((line) => line.countedQuantity === null)) {
        throw new BadRequestException("Faltan productos por contar");
      }
      let movements = 0;
      for (const line of count.lines) {
        const delta = countAdjustment(line.snapshotQuantity, line.countedQuantity!);
        const movement = await this.inventory.applyMovementTx(tx, {
          locationId: count.locationId,
          productId: line.productId,
          type: "COUNT_ADJUSTMENT",
          quantityDelta: delta,
          referenceType: "StockCount",
          referenceId: count.id,
          referenceLineId: line.id,
          performedByUserId: user.id
        });
        if (movement) movements += 1;
      }
      await tx.stockCount.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completedByUserId: user.id
        }
      });
      const response = { id, status: "COMPLETED", movements };
      await this.saveResponse(tx, user.id, "COMPLETE_COUNT", key, response);
      await this.audit(tx, user.id, "COMPLETE", "StockCount", id, response);
      return response;
    });
  }

  async cancelCount(user: AuthUser, id: string) {
    const count = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException("Conteo no encontrado");
    this.assertLocation(user, count.locationId);
    if (count.status !== "IN_PROGRESS") throw new ConflictException("El conteo ya no puede cancelarse");
    return this.prisma.stockCount.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() }
    });
  }

  listRequests(user: AuthUser, requestedLocationId?: string) {
    return this.prisma.supplyRequest.findMany({
      where: { locationId: this.scopedLocation(user, requestedLocationId) },
      include: {
        location: true,
        requestedBy: { select: { id: true, name: true } },
        lines: { include: { product: { include: { unit: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createRequest(
    user: AuthUser,
    locationId: string,
    lines: RequestLineInput[],
    notes?: string
  ) {
    this.assertLocation(user, locationId);
    const positive = lines.filter((line) => new Prisma.Decimal(line.quantity).greaterThan(0));
    if (!positive.length) throw new BadRequestException("Agrega al menos un producto");
    return this.prisma.$transaction(async (tx) =>
      tx.supplyRequest.create({
        data: {
          folio: await nextFolio(tx, "SOL"),
          locationId,
          requestedByUserId: user.id,
          notes,
          lines: {
            create: positive.map((line) => ({
              productId: line.productId,
              requestedQuantity: new Prisma.Decimal(line.quantity),
              notes: line.notes
            }))
          }
        },
        include: { lines: true }
      })
    );
  }

  async submitRequest(user: AuthUser, id: string) {
    const request = await this.prisma.supplyRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Solicitud no encontrada");
    this.assertLocation(user, request.locationId);
    if (request.status !== "DRAFT") throw new ConflictException("La solicitud ya fue enviada");
    return this.prisma.supplyRequest.update({
      where: { id },
      data: { status: "PENDING" }
    });
  }

  async cancelRequest(user: AuthUser, id: string) {
    const request = await this.prisma.supplyRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Solicitud no encontrada");
    this.assertLocation(user, request.locationId);
    if (!["DRAFT", "PENDING", "PARTIAL"].includes(request.status)) {
      throw new ConflictException("La solicitud ya no puede cancelarse");
    }
    return this.prisma.supplyRequest.update({
      where: { id },
      data: { status: "CANCELLED" }
    });
  }

  listTransfers(user: AuthUser, requestedLocationId?: string) {
    const where =
      user.role === "DRIVER"
        ? { driverUserId: user.id }
        : { destinationLocationId: this.scopedLocation(user, requestedLocationId) };
    return this.prisma.transfer.findMany({
      where,
      include: {
        destination: true,
        driver: { select: { id: true, name: true } },
        lines: { include: { product: { include: { unit: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async checkAvailability(
    user: AuthUser,
    sourceLocationId: string,
    items: Array<{ productId: string; quantity: string }>
  ) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        locationId: sourceLocationId,
        productId: { in: items.map((i) => i.productId) }
      },
      include: { product: true }
    });

    const byProduct = new Map(balances.map((b) => [b.productId, b]));
    return items.map((item) => {
      const balance = byProduct.get(item.productId);
      const available = balance?.quantity ?? new Prisma.Decimal(0);
      const requested = new Prisma.Decimal(item.quantity);
      return {
        productId: item.productId,
        productName: balance?.product.name ?? "Producto desconocido",
        available: available.toNumber(),
        requested: requested.toNumber(),
        isAvailable: available.greaterThanOrEqualTo(requested)
      };
    });
  }

  async createTransfer(
    user: AuthUser,
    destinationLocationId: string,
    sourceLocationId: string,
    lines: TransferLineInput[],
    notes?: string
  ) {
    if (!["SYSTEM_OWNER", "ADMIN"].includes(user.role)) throw new ForbiddenException();

    // Validar disponibilidad
    if (sourceLocationId) {
      const availability = await this.checkAvailability(
        user,
        sourceLocationId,
        lines.map((l) => ({ productId: l.productId, quantity: l.sentQuantity }))
      );
      const unavailable = availability.filter((a) => !a.isAvailable);
      if (unavailable.length > 0) {
        throw new BadRequestException({
          message: "Productos sin suficiente disponibilidad",
          items: unavailable
        });
      }
    }

    return this.prisma.$transaction(async (tx) =>
      tx.transfer.create({
        data: {
          folio: await nextFolio(tx, "SUR"),
          destinationLocationId,
          sourceLocationId,
          preparedByUserId: user.id,
          status: "PREPARING",
          preparedAt: new Date(),
          notes,
          lines: {
            create: lines.map((line) => ({
              productId: line.productId,
              sentQuantity: new Prisma.Decimal(line.sentQuantity),
              supplyRequestLineId: line.supplyRequestLineId
            }))
          }
        },
        include: { lines: { include: { product: true } } }
      })
    );
  }

  async assignDriver(user: AuthUser, id: string, driverUserId: string) {
    if (!["SYSTEM_OWNER", "ADMIN"].includes(user.role)) throw new ForbiddenException();
    const driver = await this.prisma.user.findFirst({
      where: { id: driverUserId, role: "DRIVER", active: true }
    });
    if (!driver) throw new BadRequestException("Repartidor no disponible");
    return this.prisma.transfer.update({
      where: { id },
      data: { driverUserId, status: "ASSIGNED", assignedAt: new Date() }
    });
  }

  async cancelTransfer(user: AuthUser, id: string) {
    if (!["SYSTEM_OWNER", "ADMIN"].includes(user.role)) throw new ForbiddenException();
    const transfer = await this.prisma.transfer.findUnique({ where: { id } });
    if (!transfer) throw new NotFoundException("Surtido no encontrado");
    if (!["DRAFT", "PREPARING", "ASSIGNED"].includes(transfer.status)) {
      throw new ConflictException("El surtido ya no puede cancelarse");
    }
    return this.prisma.transfer.update({
      where: { id },
      data: { status: "CANCELLED" }
    });
  }

  async driverTransition(user: AuthUser, id: string, action: "start" | "deliver") {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({ where: { id }, include: { lines: true } });
      if (!transfer) throw new NotFoundException("Surtido no encontrado");
      if (user.role !== "SYSTEM_OWNER" && transfer.driverUserId !== user.id) {
        throw new ForbiddenException("Esta entrega no está asignada a tu usuario");
      }
      const expected = action === "start" ? "ASSIGNED" : "IN_ROUTE";
      if (transfer.status !== expected) throw new ConflictException("La entrega cambió de estado");

      // La mercancía sale físicamente de la sucursal origen al iniciar el
      // reparto: ahí se descuenta su stock. El destino se suma al recibir.
      if (action === "start" && transfer.sourceLocationId) {
        for (const line of transfer.lines) {
          await this.inventory.applyMovementTx(tx, {
            locationId: transfer.sourceLocationId,
            productId: line.productId,
            type: "TRANSFER_OUT",
            quantityDelta: line.sentQuantity.negated(),
            referenceType: "Transfer",
            referenceId: transfer.id,
            referenceLineId: line.id,
            performedByUserId: user.id
          });
        }
      }

      return tx.transfer.update({
        where: { id },
        data:
          action === "start"
            ? { status: "IN_ROUTE", departedAt: new Date() }
            : { status: "DELIVERED", deliveredAt: new Date() }
      });
    });
  }

  async preReceiveTransfer(user: AuthUser, id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { lines: { include: { product: true } } }
    });
    if (!transfer) throw new NotFoundException("Surtido no encontrado");
    this.assertLocation(user, transfer.destinationLocationId);

    if (transfer.status !== "DELIVERED") {
      throw new ConflictException("El surtido no está listo para recepción");
    }

    const incidents: Array<{
      type: "DAMAGED_PRODUCT" | "RECEPTION_DIFFERENCE";
      productId: string;
      productName: string;
      difference?: number;
    }> = [];

    return {
      transferId: transfer.id,
      lines: transfer.lines.map((line) => ({
        lineId: line.id,
        productId: line.productId,
        productName: line.product.name,
        sentQuantity: line.sentQuantity.toNumber(),
        status: line.receptionStatus
      })),
      preconditions: {
        allLinesPresent: transfer.lines.length > 0,
        statusValid: transfer.status === "DELIVERED"
      }
    };
  }

  async receiveTransfer(
    user: AuthUser,
    id: string,
    key: string,
    receptionLines: ReceptionLineInput[]
  ) {
    if (!key) throw new BadRequestException("Idempotency-Key es obligatorio");
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.previousResponse(tx, user.id, "RECEIVE_TRANSFER", key);
      if (previous) return previous;
      const transfer = await tx.transfer.findUnique({ where: { id }, include: { lines: true } });
      if (!transfer) throw new NotFoundException("Surtido no encontrado");
      this.assertLocation(user, transfer.destinationLocationId);
      if (transfer.status !== "DELIVERED") {
        throw new ConflictException("El surtido no está listo para recepción");
      }
      const inputs = new Map(receptionLines.map((line) => [line.lineId, line]));
      if (transfer.lines.some((line) => !inputs.has(line.id))) {
        throw new BadRequestException("Captura todos los productos");
      }
      let differences = 0;
      const requestIds = new Set<string>();
      for (const line of transfer.lines) {
        const input = inputs.get(line.id)!;
        const received = new Prisma.Decimal(input.receivedQuantity);
        if (received.isNegative()) throw new BadRequestException("La cantidad recibida no puede ser negativa");
        const outcome = receptionOutcome(line.sentQuantity, received, input.damaged);
        const { difference, hasDifference, status: receptionStatus } = outcome;
        if (hasDifference) differences += 1;
        await tx.transferLine.update({
          where: { id: line.id },
          data: {
            receivedQuantity: received,
            differenceQuantity: difference,
            receptionStatus,
            notes: input.notes
          }
        });
        await this.inventory.applyMovementTx(tx, {
          locationId: transfer.destinationLocationId,
          productId: line.productId,
          type: "TRANSFER_IN",
          quantityDelta: received,
          referenceType: "Transfer",
          referenceId: transfer.id,
          referenceLineId: line.id,
          performedByUserId: user.id,
          notes: input.notes
        });
        if (line.supplyRequestLineId) {
          const requestLine = await tx.supplyRequestLine.update({
            where: { id: line.supplyRequestLineId },
            data: { fulfilledQuantity: { increment: received } },
            include: { request: true }
          });
          requestIds.add(requestLine.supplyRequestId);
        }
        if (hasDifference) {
          await tx.incident.create({
            data: {
              folio: await nextFolio(tx, "INC"),
              type: input.damaged ? "DAMAGED_PRODUCT" : "RECEPTION_DIFFERENCE",
              locationId: transfer.destinationLocationId,
              transferId: transfer.id,
              transferLineId: line.id,
              productId: line.productId,
              description: input.reason || input.notes || "Diferencia detectada en recepción",
              quantityDifference: difference,
              reportedByUserId: user.id
            }
          });
        }
      }
      for (const requestId of requestIds) {
        const request = await tx.supplyRequest.findUnique({
          where: { id: requestId },
          include: { lines: true }
        });
        if (!request) continue;
        const completed = request.lines.every((line) =>
          line.fulfilledQuantity.greaterThanOrEqualTo(line.requestedQuantity)
        );
        await tx.supplyRequest.update({
          where: { id: requestId },
          data: {
            status: completed ? "COMPLETED" : "PARTIAL",
            completedAt: completed ? new Date() : null
          }
        });
      }
      const status = differences ? "RECEIVED_WITH_DIFFERENCES" : "RECEIVED";
      await tx.transfer.update({
        where: { id },
        data: {
          status,
          receivedAt: new Date(),
          receivedByUserId: user.id
        }
      });
      const response = { id, status, differences };
      await this.saveResponse(tx, user.id, "RECEIVE_TRANSFER", key, response);
      await this.audit(tx, user.id, "RECEIVE", "Transfer", id, response);
      return response;
    });
  }

  listIncidents(user: AuthUser, requestedLocationId?: string) {
    return this.prisma.incident.findMany({
      where: { locationId: this.scopedLocation(user, requestedLocationId) },
      include: { location: true, product: true, reportedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async resolveIncident(user: AuthUser, id: string) {
    if (!["SYSTEM_OWNER", "ADMIN"].includes(user.role)) throw new ForbiddenException();
    return this.prisma.incident.update({
      where: { id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByUserId: user.id }
    });
  }

  auditLogs(user: AuthUser) {
    if (!["SYSTEM_OWNER", "ADMIN"].includes(user.role)) throw new ForbiddenException();
    return this.prisma.auditLog.findMany({
      where: user.role === "SYSTEM_OWNER" ? {} : { user: { hiddenFromAdmin: false } },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  private scopedLocation(user: AuthUser, requested?: string) {
    if (user.role === "MANAGER") return user.locationId ?? "__none__";
    return requested || undefined;
  }

  private assertLocation(user: AuthUser, locationId: string) {
    if (user.role === "MANAGER" && user.locationId !== locationId) {
      throw new ForbiddenException("No tienes acceso a esta sucursal");
    }
  }

  private async previousResponse(
    tx: Prisma.TransactionClient,
    userId: string,
    operation: string,
    key: string
  ) {
    const record = await tx.idempotencyRecord.findUnique({
      where: { userId_operation_key: { userId, operation, key } }
    });
    return record?.response;
  }

  private saveResponse(
    tx: Prisma.TransactionClient,
    userId: string,
    operation: string,
    key: string,
    response: object
  ) {
    return tx.idempotencyRecord.create({
      data: { userId, operation, key, response }
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterData: object
  ) {
    return tx.auditLog.create({
      data: { userId, action, entityType, entityId, afterData }
    });
  }
}
