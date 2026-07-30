import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { quantitySchema, signedQuantitySchema } from "@fatboy/shared";
import { z } from "zod";
import { AuthGuard, type AuthRequest, Roles, RolesGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma.service";
import { InventoryService } from "./inventory.service";

const purchaseSchema = z.object({
  locationId: z.string().min(1),
  supplier: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(z.object({ productId: z.string().min(1), quantity: quantitySchema }))
    .min(1, "Captura al menos un producto")
});

@Controller("inventory")
@UseGuards(AuthGuard, RolesGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  list(@Req() request: AuthRequest, @Query("locationId") requested?: string) {
    const locationId = request.user.role === "MANAGER" ? request.user.locationId ?? undefined : requested;
    return this.inventory.list(locationId);
  }

  @Get(":locationId/:productId/movements")
  history(
    @Req() request: AuthRequest,
    @Param("locationId") locationId: string,
    @Param("productId") productId: string
  ) {
    if (request.user.role === "MANAGER" && request.user.locationId !== locationId) {
      return [];
    }
    return this.inventory.movements(locationId, productId);
  }

  /// Entrada de mercancía comprada a una sucursal: suma stock ahí y desde esa
  /// sucursal ya puede surtirse a las demás.
  @Post("purchases")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async purchase(
    @Req() request: AuthRequest,
    @Headers("idempotency-key") key: string,
    @Body() body: unknown
  ) {
    if (!key) throw new BadRequestException("Idempotency-Key es obligatorio");
    const input = purchaseSchema.parse(body);
    const location = await this.prisma.location.findFirst({
      where: { id: input.locationId, active: true }
    });
    if (!location) throw new BadRequestException("Sucursal no válida");

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { userId_operation_key: { userId: request.user.id, operation: "PURCHASE", key } }
      });
      if (existing) return existing.response;

      const notes = [input.supplier ? `Proveedor: ${input.supplier}` : null, input.notes]
        .filter(Boolean)
        .join(" · ");
      let applied = 0;
      for (const [index, line] of input.lines.entries()) {
        const movement = await this.inventory.applyMovementTx(tx, {
          locationId: input.locationId,
          productId: line.productId,
          type: "PURCHASE_ENTRY",
          quantityDelta: line.quantity,
          referenceType: "Purchase",
          referenceId: key,
          referenceLineId: `${key}:${index}`,
          performedByUserId: request.user.id,
          notes: notes || undefined
        });
        if (movement) applied += 1;
      }
      if (!applied) throw new BadRequestException("Captura al menos una cantidad mayor a cero");

      const response = { locationId: input.locationId, lines: applied };
      await tx.idempotencyRecord.create({
        data: { userId: request.user.id, operation: "PURCHASE", key, response }
      });
      return response;
    });
  }

  @Post("adjustments")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async adjust(
    @Req() request: AuthRequest,
    @Headers("idempotency-key") key: string,
    @Body() body: { locationId: string; productId: string; quantityDelta: string; notes: string }
  ) {
    const quantityDelta = signedQuantitySchema.parse(body.quantityDelta);
    if (!key) throw new Error("Idempotency-Key es obligatorio");
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { userId_operation_key: { userId: request.user.id, operation: "ADJUST", key } }
      });
      if (existing) return existing.response;
      const movement = await this.inventory.applyMovementTx(tx, {
        locationId: body.locationId,
        productId: body.productId,
        type: "MANUAL_ADJUSTMENT",
        quantityDelta,
        referenceType: "ManualAdjustment",
        referenceId: key,
        referenceLineId: key,
        performedByUserId: request.user.id,
        notes: body.notes
      });
      const response = { movementId: movement?.id ?? null };
      await tx.idempotencyRecord.create({
        data: { userId: request.user.id, operation: "ADJUST", key, response }
      });
      return response;
    });
  }
}
