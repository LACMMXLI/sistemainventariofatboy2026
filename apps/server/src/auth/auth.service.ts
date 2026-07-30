import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma.service";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });
    if (!user?.active || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });
    return this.issueSession(user);
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedException("Sesión no disponible");
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hash(rawToken) },
      include: { user: true }
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.active
    ) {
      throw new UnauthorizedException("La sesión expiró");
    }
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });
    return this.issueSession(session.user);
  }

  async logout(rawToken: string | undefined) {
    if (rawToken) {
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash: hash(rawToken), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
  }

  private async issueSession(user: {
    id: string;
    name: string;
    email: string;
    role: "SYSTEM_OWNER" | "ADMIN" | "SUPERVISOR" | "MANAGER" | "DRIVER";
    locationId: string | null;
    authVersion: number;
  }) {
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: hash(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      locationId: user.locationId,
      av: user.authVersion
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        locationId: user.locationId
      }
    };
  }
}
