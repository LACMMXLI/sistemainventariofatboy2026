import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { quantitySchema } from "@fatboy/shared";
import { z } from "zod";
import { AuthGuard, type AuthRequest, Roles, RolesGuard } from "../auth/auth.guard";
import { OperationsService } from "./operations.service";

const incidentSchema = z.object({
  locationId: z.string().min(1),
  type: z.enum(["MISSING_PRODUCT", "EXCESS_PRODUCT", "DAMAGED_PRODUCT", "RECEPTION_DIFFERENCE", "OTHER"]),
  description: z.string().trim().min(5, "Describe qué pasó").max(500),
  productId: z.string().min(1).optional().nullable(),
  transferId: z.string().min(1).optional().nullable(),
  quantityDifference: quantitySchema.optional().nullable()
});

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("dashboard")
  dashboard(@Req() request: AuthRequest, @Query("locationId") locationId?: string) {
    return this.operations.dashboard(request.user, locationId);
  }

  @Get("counts")
  counts(@Req() request: AuthRequest, @Query("locationId") locationId?: string) {
    return this.operations.listCounts(request.user, locationId);
  }

  @Post("counts")
  startCount(
    @Req() request: AuthRequest,
    @Body() body: { locationId: string; notes?: string }
  ) {
    return this.operations.startCount(request.user, body.locationId, body.notes);
  }

  @Get("counts/:id")
  count(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.getCount(request.user, id);
  }

  @Patch("counts/:id/lines/:lineId")
  updateCountLine(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: { countedQuantity: string; version: number; clientMutationId: string; notes?: string }
  ) {
    return this.operations.updateCountLine(
      request.user,
      id,
      lineId,
      quantitySchema.parse(body.countedQuantity),
      body.version,
      body.clientMutationId,
      body.notes
    );
  }

  /// Comparativo del conteo (esperado vs. físico). Solo responde si ya se cerró.
  @Get("counts/:id/result")
  countResult(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.countResult(request.user, id);
  }

  @Get("counts/:id/validate")
  preCompleteCount(
    @Req() request: AuthRequest,
    @Param("id") id: string
  ) {
    return this.operations.preCompleteCount(request.user, id);
  }

  @Post("counts/:id/complete")
  completeCount(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string
  ) {
    return this.operations.completeCount(request.user, id, key);
  }

  @Post("counts/:id/cancel")
  cancelCount(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.cancelCount(request.user, id);
  }

  @Get("requests")
  requests(@Req() request: AuthRequest, @Query("locationId") locationId?: string) {
    return this.operations.listRequests(request.user, locationId);
  }

  @Post("requests")
  createRequest(
    @Req() request: AuthRequest,
    @Body() body: {
      locationId: string;
      notes?: string;
      lines: Array<{ productId: string; quantity: string; notes?: string }>;
    }
  ) {
    return this.operations.createRequest(request.user, body.locationId, body.lines, body.notes);
  }

  @Post("requests/:id/submit")
  submitRequest(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.submitRequest(request.user, id);
  }

  @Post("requests/:id/cancel")
  cancelRequest(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.cancelRequest(request.user, id);
  }

  @Get("transfers")
  transfers(
    @Req() request: AuthRequest,
    @Query("locationId") locationId?: string,
    @Query("mine") mine?: string
  ) {
    return this.operations.listTransfers(request.user, locationId, mine === "true");
  }

  @Get("inventory/check-availability")
  checkAvailability(
    @Req() request: AuthRequest,
    @Query("locationId") locationId: string,
    @Query("items") itemsJson?: string
  ) {
    const items = itemsJson ? JSON.parse(itemsJson) : [];
    return this.operations.checkAvailability(request.user, locationId, items);
  }

  @Post("transfers")
  @Roles("SYSTEM_OWNER", "ADMIN", "SUPERVISOR")
  createTransfer(
    @Req() request: AuthRequest,
    @Body() body: {
      sourceLocationId?: string;
      destinationLocationId: string;
      notes?: string;
      lines: Array<{
        productId: string;
        sentQuantity: string;
        supplyRequestLineId?: string;
      }>;
    }
  ) {
    return this.operations.createTransfer(
      request.user,
      body.destinationLocationId,
      body.sourceLocationId || "",
      body.lines,
      body.notes
    );
  }

  @Post("transfers/:id/assign-driver")
  @Roles("SYSTEM_OWNER", "ADMIN", "SUPERVISOR")
  assignDriver(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: { driverUserId: string }
  ) {
    return this.operations.assignDriver(request.user, id, body.driverUserId);
  }

  @Post("transfers/:id/cancel")
  @Roles("SYSTEM_OWNER", "ADMIN", "SUPERVISOR")
  cancelTransfer(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.cancelTransfer(request.user, id);
  }

  @Post("transfers/:id/start")
  @Roles("SYSTEM_OWNER", "DRIVER", "SUPERVISOR")
  startDelivery(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.driverTransition(request.user, id, "start");
  }

  @Post("transfers/:id/deliver")
  @Roles("SYSTEM_OWNER", "DRIVER", "SUPERVISOR")
  deliver(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.driverTransition(request.user, id, "deliver");
  }

  @Get("transfers/:id/pre-receive")
  preReceiveTransfer(
    @Req() request: AuthRequest,
    @Param("id") id: string
  ) {
    return this.operations.preReceiveTransfer(request.user, id);
  }

  @Post("transfers/:id/receive")
  @Roles("SYSTEM_OWNER", "ADMIN", "SUPERVISOR", "MANAGER")
  receive(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body() body: {
      lines: Array<{
        lineId: string;
        receivedQuantity: string;
        damaged?: boolean;
        reason?: string;
        notes?: string;
      }>;
    }
  ) {
    return this.operations.receiveTransfer(request.user, id, key, body.lines);
  }

  @Get("incidents")
  incidents(@Req() request: AuthRequest, @Query("locationId") locationId?: string) {
    return this.operations.listIncidents(request.user, locationId);
  }

  @Post("incidents")
  @Roles("SYSTEM_OWNER", "ADMIN", "SUPERVISOR", "MANAGER")
  createIncident(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.operations.createIncident(request.user, incidentSchema.parse(body));
  }

  @Post("incidents/:id/resolve")
  @Roles("SYSTEM_OWNER", "ADMIN", "SUPERVISOR")
  resolveIncident(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.operations.resolveIncident(request.user, id);
  }

  @Get("audit")
  @Roles("SYSTEM_OWNER", "ADMIN")
  audit(@Req() request: AuthRequest) {
    return this.operations.auditLogs(request.user);
  }

  @Get("reports/summary")
  report(@Req() request: AuthRequest, @Query("locationId") locationId?: string) {
    return this.operations.dashboard(request.user, locationId);
  }
}
