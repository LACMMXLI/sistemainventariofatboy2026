import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { productSchema } from "@fatboy/shared";
import { hash } from "bcryptjs";
import { AuthGuard, type AuthRequest, Roles, RolesGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma.service";

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("locations")
  locations() {
    return this.prisma.location.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    });
  }

  @Get("units")
  units() {
    return this.prisma.unit.findMany({ orderBy: { name: "asc" } });
  }

  @Post("units")
  @Roles("SYSTEM_OWNER", "ADMIN")
  createUnit(
    @Body() body: {
      name: string;
      symbol: string;
      allowDecimals?: boolean;
      decimalPlaces?: number;
    }
  ) {
    return this.prisma.unit.create({
      data: {
        name: body.name.trim(),
        symbol: body.symbol.trim(),
        allowDecimals: body.allowDecimals ?? false,
        decimalPlaces: body.decimalPlaces ?? 0
      }
    });
  }

  @Get("categories")
  categories() {
    return this.prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }

  @Post("categories")
  @Roles("SYSTEM_OWNER", "ADMIN")
  createCategory(@Body() body: { name: string; sortOrder?: number }) {
    return this.prisma.category.create({
      data: { name: body.name.trim(), sortOrder: body.sortOrder ?? 0 }
    });
  }

  @Put("locations/:id/products")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async assignLocationProducts(
    @Param("id") locationId: string,
    @Body() body: { productIds: string[] }
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.locationProduct.updateMany({ where: { locationId }, data: { active: false } });
      for (const [sortOrder, productId] of body.productIds.entries()) {
        await tx.locationProduct.upsert({
          where: { locationId_productId: { locationId, productId } },
          create: { locationId, productId, sortOrder },
          update: { active: true, sortOrder }
        });
      }
    });
    return { locationId, assigned: body.productIds.length };
  }

  @Get("products")
  async products(
    @Req() request: AuthRequest,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
    @Query("active") active?: string,
    @Query("locationId") requestedLocationId?: string
  ) {
    const locationId =
      request.user.role === "MANAGER" ? request.user.locationId : requestedLocationId;
    return this.prisma.product.findMany({
      where: {
        name: search ? { contains: search, mode: "insensitive" } : undefined,
        categoryId: categoryId || undefined,
        active: active === undefined ? undefined : active === "true",
        locations: locationId ? { some: { locationId, active: true } } : undefined
      },
      include: {
        category: true,
        unit: true,
        locations: { where: { active: true }, include: { location: true } }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  @Get("products/:id")
  async product(@Param("id") id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, unit: true, locations: { include: { location: true } } }
    });
    if (!product) throw new NotFoundException("Producto no encontrado");
    return product;
  }

  @Post("products")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async createProduct(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = productSchema.parse(body);
    const normalizedName = input.name.trim().toLocaleLowerCase("es-MX");
    const exists = await this.prisma.product.findUnique({ where: { normalizedName } });
    if (exists) throw new ConflictException("Ya existe un producto con ese nombre");
    const product = await this.prisma.product.create({
      data: { ...input, normalizedName }
    });
    await this.audit(request, "CREATE", "Product", product.id, null, product);
    return product;
  }

  @Patch("products/:id")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async updateProduct(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const input = productSchema.partial().parse(body);
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Producto no encontrado");
    const hasHistory = await this.prisma.inventoryMovement.count({ where: { productId: id } });
    if (input.unitId && input.unitId !== before.unitId && hasHistory) {
      throw new ConflictException("La unidad no puede cambiar porque el producto tiene movimientos");
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...input,
        normalizedName: input.name
          ? input.name.trim().toLocaleLowerCase("es-MX")
          : undefined
      }
    });
    await this.audit(request, "UPDATE", "Product", id, before, product);
    return product;
  }

  @Post("products/:id/activate")
  @Roles("SYSTEM_OWNER", "ADMIN")
  setProductActive(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.changeActive(request, id, true);
  }

  @Post("products/:id/deactivate")
  @Roles("SYSTEM_OWNER", "ADMIN")
  setProductInactive(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.changeActive(request, id, false);
  }

  @Get("users")
  @Roles("SYSTEM_OWNER", "ADMIN")
  users(@Req() request: AuthRequest) {
    return this.prisma.user.findMany({
      where: request.user.role === "SYSTEM_OWNER" ? {} : { hiddenFromAdmin: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        locationId: true,
        active: true,
        lastLoginAt: true
      },
      orderBy: { name: "asc" }
    });
  }

  @Post("users")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async createUser(
    @Req() request: AuthRequest,
    @Body() body: {
      name: string;
      email: string;
      password: string;
      role: "ADMIN" | "MANAGER" | "DRIVER";
      locationId?: string | null;
    }
  ) {
    if (body.password.length < 12) throw new ConflictException("La contraseña debe tener al menos 12 caracteres");
    if (body.role === "MANAGER" && !body.locationId) throw new ConflictException("El encargado requiere sucursal");
    const user = await this.prisma.user.create({
      data: {
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        passwordHash: await hash(body.password, 12),
        role: body.role,
        locationId: body.role === "MANAGER" ? body.locationId : null
      }
    });
    await this.audit(request, "CREATE", "User", user.id, null, { ...user, passwordHash: "[REDACTED]" });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  @Patch("users/:id")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async updateUser(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: {
      name?: string;
      role?: "ADMIN" | "MANAGER" | "DRIVER";
      locationId?: string | null;
      active?: boolean;
    }
  ) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before || (before.hiddenFromAdmin && request.user.role !== "SYSTEM_OWNER")) {
      throw new NotFoundException("Usuario no encontrado");
    }
    if (before.role === "SYSTEM_OWNER") throw new ConflictException("La cuenta superior no se administra desde la aplicación");
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        role: body.role,
        locationId: body.role === "MANAGER" ? body.locationId : body.role ? null : body.locationId,
        active: body.active,
        authVersion: body.active === false ? { increment: 1 } : undefined
      }
    });
    await this.audit(request, "UPDATE", "User", id, { ...before, passwordHash: "[REDACTED]" }, { ...user, passwordHash: "[REDACTED]" });
    return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
  }

  @Post("users/:id/reset-password")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async resetPassword(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: { password: string }
  ) {
    if (body.password.length < 12) throw new ConflictException("La contraseña debe tener al menos 12 caracteres");
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.hiddenFromAdmin || target.role === "SYSTEM_OWNER") {
      throw new NotFoundException("Usuario no encontrado");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await hash(body.password, 12), authVersion: { increment: 1 } }
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() }
      }),
      this.prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: "RESET_PASSWORD",
          entityType: "User",
          entityId: id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        }
      })
    ]);
    return { ok: true };
  }

  private async changeActive(request: AuthRequest, id: string, active: boolean) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Producto no encontrado");
    const product = await this.prisma.product.update({ where: { id }, data: { active } });
    await this.audit(request, active ? "ACTIVATE" : "DEACTIVATE", "Product", id, before, product);
    return product;
  }

  private audit(
    request: AuthRequest,
    action: string,
    entityType: string,
    entityId: string,
    beforeData: unknown,
    afterData: unknown
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action,
        entityType,
        entityId,
        beforeData: (beforeData ?? undefined) as never,
        afterData: (afterData ?? undefined) as never,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    });
  }
}
