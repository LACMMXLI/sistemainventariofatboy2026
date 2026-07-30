import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { productSchema } from "@fatboy/shared";
import { hash } from "bcryptjs";
import { AuthGuard, type AuthRequest, Roles, RolesGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma.service";
import { nextFolio } from "../folio";

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

  @Post("locations")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async createLocation(
    @Req() request: AuthRequest,
    @Body() body: { name: string; code: string }
  ) {
    const name = body.name?.trim();
    const code = body.code?.trim().toUpperCase();
    if (!name || name.length < 2 || !code || code.length > 12) {
      throw new BadRequestException("Nombre y código de sucursal son obligatorios");
    }
    const location = await this.prisma.$transaction(async (tx) => {
      const created = await tx.location.create({
        data: { folio: await nextFolio(tx, "SUC"), name, code }
      });
      // Catálogo único: la sucursal nace con todo el catálogo en cero.
      const products = await tx.product.findMany({ where: { active: true }, select: { id: true } });
      if (products.length) {
        await tx.inventoryBalance.createMany({
          data: products.map((product) => ({
            locationId: created.id,
            productId: product.id,
            quantity: 0
          })),
          skipDuplicates: true
        });
      }
      return created;
    });
    await this.audit(request, "CREATE", "Location", location.id, null, location);
    return location;
  }

  @Patch("locations/:id")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async updateLocation(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: { name?: string; code?: string }
  ) {
    const before = await this.prisma.location.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Sucursal no encontrada");
    const name = body.name?.trim();
    const code = body.code?.trim().toUpperCase();
    if (body.name !== undefined && (!name || name.length < 2)) {
      throw new BadRequestException("El nombre de la sucursal no es válido");
    }
    if (body.code !== undefined && (!code || code.length > 12)) {
      throw new BadRequestException("El código de la sucursal es obligatorio");
    }
    const location = await this.prisma.location.update({
      where: { id },
      data: { name, code }
    });
    await this.audit(request, "UPDATE", "Location", id, before, location);
    return location;
  }

  @Get("units")
  units() {
    return this.prisma.unit.findMany({ orderBy: { name: "asc" } });
  }

  @Post("units")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async createUnit(
    @Req() request: AuthRequest,
    @Body() body: {
      name: string;
      symbol: string;
      allowDecimals?: boolean;
      decimalPlaces?: number;
    }
  ) {
    const name = body.name?.trim();
    const symbol = body.symbol?.trim();
    if (!name || name.length < 2 || !symbol || symbol.length > 6) {
      throw new BadRequestException("Nombre y símbolo de unidad son obligatorios");
    }
    if (body.decimalPlaces !== undefined && (!Number.isInteger(body.decimalPlaces) || body.decimalPlaces < 0 || body.decimalPlaces > 4)) {
      throw new BadRequestException("Los decimales deben estar entre 0 y 4");
    }
    const unit = await this.prisma.$transaction(async (tx) =>
      tx.unit.create({
        data: {
          folio: await nextFolio(tx, "UNI"),
          name,
          symbol,
          allowDecimals: body.allowDecimals ?? false,
          decimalPlaces: body.decimalPlaces ?? 0
        }
      })
    );
    await this.audit(request, "CREATE", "Unit", unit.id, null, unit);
    return unit;
  }

  @Patch("units/:id")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async updateUnit(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: {
      name?: string;
      symbol?: string;
      allowDecimals?: boolean;
      decimalPlaces?: number;
    }
  ) {
    const before = await this.prisma.unit.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Unidad no encontrada");
    const name = body.name?.trim();
    const symbol = body.symbol?.trim();
    if (body.name !== undefined && (!name || name.length < 2)) {
      throw new BadRequestException("El nombre de la unidad no es válido");
    }
    if (body.symbol !== undefined && (!symbol || symbol.length > 6)) {
      throw new BadRequestException("El símbolo de la unidad es obligatorio");
    }
    if (body.decimalPlaces !== undefined && (!Number.isInteger(body.decimalPlaces) || body.decimalPlaces < 0 || body.decimalPlaces > 4)) {
      throw new BadRequestException("Los decimales deben estar entre 0 y 4");
    }
    const unit = await this.prisma.unit.update({
      where: { id },
      data: {
        name,
        symbol,
        allowDecimals: body.allowDecimals,
        decimalPlaces: body.decimalPlaces
      }
    });
    await this.audit(request, "UPDATE", "Unit", id, before, unit);
    return unit;
  }

  @Get("categories")
  categories() {
    return this.prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }

  @Post("categories")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async createCategory(
    @Req() request: AuthRequest,
    @Body() body: { name: string; sortOrder?: number }
  ) {
    const name = body.name?.trim();
    if (!name || name.length < 2) throw new BadRequestException("El nombre de la categoría no es válido");
    const category = await this.prisma.$transaction(async (tx) =>
      tx.category.create({
        data: { folio: await nextFolio(tx, "CAT"), name, sortOrder: body.sortOrder ?? 0 }
      })
    );
    await this.audit(request, "CREATE", "Category", category.id, null, category);
    return category;
  }

  @Patch("categories/:id")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async updateCategory(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: { name?: string; sortOrder?: number }
  ) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Categoría no encontrada");
    const name = body.name?.trim();
    if (body.name !== undefined && (!name || name.length < 2)) {
      throw new BadRequestException("El nombre de la categoría no es válido");
    }
    const category = await this.prisma.category.update({
      where: { id },
      data: { name, sortOrder: body.sortOrder }
    });
    await this.audit(request, "UPDATE", "Category", id, before, category);
    return category;
  }

  /// El catálogo es único para todas las sucursales, así que `locationId` ya no
  /// filtra nada; se sigue aceptando para no romper clientes viejos.
  @Get("products")
  async products(
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
    @Query("active") active?: string
  ) {
    return this.prisma.product.findMany({
      where: {
        name: search ? { contains: search, mode: "insensitive" } : undefined,
        categoryId: categoryId || undefined,
        active: active === undefined ? undefined : active === "true"
      },
      include: { category: true, unit: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  @Get("products/:id")
  async product(@Param("id") id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, unit: true }
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
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...input, normalizedName, folio: await nextFolio(tx, "PRD") }
      });
      // El producto nace en cero en todas las sucursales activas, para que
      // aparezca desde el primer conteo sin tener que asignarlo a mano.
      const locations = await tx.location.findMany({
        where: { active: true },
        select: { id: true }
      });
      if (locations.length) {
        await tx.inventoryBalance.createMany({
          data: locations.map((location) => ({
            locationId: location.id,
            productId: created.id,
            quantity: 0
          })),
          skipDuplicates: true
        });
      }
      return created;
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
        folio: true,
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
    const passwordHash = await hash(body.password, 12);
    const user = await this.prisma.$transaction(async (tx) =>
      tx.user.create({
        data: {
          folio: await nextFolio(tx, "USR"),
          name: body.name.trim(),
          email: body.email.trim().toLowerCase(),
          passwordHash,
          role: body.role,
          locationId: body.role === "MANAGER" ? body.locationId : null
        }
      })
    );
    await this.audit(request, "CREATE", "User", user.id, null, { ...user, passwordHash: "[REDACTED]" });
    return { id: user.id, folio: user.folio, name: user.name, email: user.email, role: user.role };
  }

  @Patch("users/:id")
  @Roles("SYSTEM_OWNER", "ADMIN")
  async updateUser(
    @Req() request: AuthRequest,
    @Param("id") id: string,
    @Body() body: {
      name?: string;
      email?: string;
      role?: "ADMIN" | "MANAGER" | "DRIVER";
      locationId?: string | null;
      active?: boolean;
    }
  ) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before || (before.hiddenFromAdmin && request.user.role !== "SYSTEM_OWNER")) {
      throw new NotFoundException("Usuario no encontrado");
    }
    if (before.role === "SYSTEM_OWNER" && request.user.id !== id) {
      throw new NotFoundException("Usuario no encontrado");
    }
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    if (body.name !== undefined && (!name || name.length < 2)) {
      throw new BadRequestException("El nombre del usuario no es válido");
    }
    if (body.email !== undefined && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new BadRequestException("El correo del usuario no es válido");
    }
    if (email) {
      const duplicate = await this.prisma.user.findUnique({ where: { email } });
      if (duplicate && duplicate.id !== id) throw new ConflictException("El correo ya está registrado");
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role: before.role === "SYSTEM_OWNER" ? undefined : body.role,
        locationId: before.role === "SYSTEM_OWNER"
          ? undefined
          : body.role === "MANAGER"
            ? body.locationId
            : body.role
              ? null
              : body.locationId,
        active: before.role === "SYSTEM_OWNER" ? undefined : body.active,
        authVersion: before.role !== "SYSTEM_OWNER" && body.active === false ? { increment: 1 } : undefined
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
