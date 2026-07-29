import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import type { MovementType } from "../generated/prisma/enums";
import { PrismaService } from "../prisma.service";

type MovementInput = {
  locationId: string;
  productId: string;
  type: MovementType;
  quantityDelta: string | Prisma.Decimal;
  referenceType: string;
  referenceId: string;
  referenceLineId: string;
  performedByUserId: string;
  notes?: string;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async applyMovementTx(tx: Prisma.TransactionClient, input: MovementInput) {
    const delta = new Prisma.Decimal(input.quantityDelta);
    if (delta.isZero()) return null;

    const current = await tx.inventoryBalance.upsert({
      where: {
        locationId_productId: {
          locationId: input.locationId,
          productId: input.productId
        }
      },
      create: {
        locationId: input.locationId,
        productId: input.productId,
        quantity: 0
      },
      update: {}
    });
    const after = current.quantity.add(delta);
    if (after.isNegative()) {
      throw new BadRequestException("El movimiento dejaría el inventario en negativo");
    }

    const updated = await tx.inventoryBalance.updateMany({
      where: { id: current.id, version: current.version },
      data: { quantity: after, version: { increment: 1 } }
    });
    if (updated.count !== 1) {
      throw new BadRequestException("El inventario cambió; vuelve a intentar");
    }

    return tx.inventoryMovement.create({
      data: {
        ...input,
        quantityDelta: delta,
        balanceBefore: current.quantity,
        balanceAfter: after
      }
    });
  }

  list(locationId?: string, productId?: string) {
    return this.prisma.inventoryBalance.findMany({
      where: { locationId, productId },
      include: { product: { include: { unit: true, category: true } }, location: true },
      orderBy: { product: { name: "asc" } }
    });
  }

  movements(locationId: string, productId: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { locationId, productId },
      include: { performedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" }
    });
  }
}
