import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { signedQuantitySchema } from "@fatboy/shared";
import { AuthGuard, type AuthRequest, Roles, RolesGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma.service";
import { InventoryService } from "./inventory.service";

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
