import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { loginSchema } from "@fatboy/shared";
import { AuthGuard, type AuthRequest } from "./auth.guard";
import { AuthService } from "./auth.service";

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth",
  maxAge: 30 * 24 * 60 * 60 * 1000
};

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = loginSchema.parse(body);
    const result = await this.auth.login(input.email, input.password);
    response.cookie("fatboy_refresh", result.refreshToken, cookieOptions);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("refresh")
  async refresh(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(request.cookies?.fatboy_refresh);
    response.cookie("fatboy_refresh", result.refreshToken, cookieOptions);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("logout")
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.fatboy_refresh);
    response.clearCookie("fatboy_refresh", cookieOptions);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() request: AuthRequest) {
    return request.user;
  }
}
