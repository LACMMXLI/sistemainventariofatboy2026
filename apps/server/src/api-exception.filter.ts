import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { PrismaClientKnownRequestError } from "./generated/prisma/internal/prismaNamespace";

/// Los choques contra la base son parte del uso normal (un nombre repetido, un
/// registro borrado en otra pestaña): se responden con un mensaje entendible en
/// lugar del error genérico que no le dice nada al usuario.
const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: "Ya existe un registro con esos datos" },
  P2025: { status: HttpStatus.NOT_FOUND, message: "El registro ya no existe" },
  P2003: { status: HttpStatus.CONFLICT, message: "El registro está en uso y no se puede modificar" }
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: "VALIDATION_ERROR",
        message: "Revisa los datos capturados",
        fieldErrors: exception.flatten().fieldErrors
      });
      return;
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response.status(exception.getStatus()).json(
        typeof body === "string"
          ? { code: "REQUEST_ERROR", message: body }
          : { code: "REQUEST_ERROR", ...(body as object) }
      );
      return;
    }
    const request = host.switchToHttp().getRequest<Request>();
    if (exception instanceof PrismaClientKnownRequestError) {
      const known = PRISMA_ERRORS[exception.code];
      if (known) {
        this.logger.warn(`${request.method} ${request.originalUrl}: Prisma ${exception.code}`);
        response.status(known.status).json({ code: "REQUEST_ERROR", message: known.message });
        return;
      }
    }
    // Sin esto un fallo inesperado (Prisma, S3, red) llega al usuario como un
    // toast genérico y no queda rastro de la causa en ningún lado.
    this.logger.error(
      `${request.method} ${request.originalUrl} falló`,
      exception instanceof Error ? exception.stack : String(exception)
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: "INTERNAL_ERROR",
      message: "No pudimos completar la operación"
    });
  }
}
