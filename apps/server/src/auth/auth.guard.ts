import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { Role } from "../generated/prisma/enums";
import { PrismaService } from "../prisma.service";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locationId: string | null;
};

export type AuthRequest = Request & { user: AuthUser };

export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw new UnauthorizedException("Inicia sesión para continuar");

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; av: number }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user?.active || user.authVersion !== payload.av) throw new Error();
      request.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        locationId: user.locationId
      };
      return true;
    } catch {
      throw new UnauthorizedException("La sesión expiró");
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const allowed = this.reflector.getAllAndOverride<Role[]>("roles", [
      context.getHandler(),
      context.getClass()
    ]);
    if (!allowed?.length) return true;
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (!allowed.includes(user.role)) throw new ForbiddenException("No tienes permiso para esta operación");
    return true;
  }
}
