import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
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
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: "INTERNAL_ERROR",
      message: "No pudimos completar la operación"
    });
  }
}
