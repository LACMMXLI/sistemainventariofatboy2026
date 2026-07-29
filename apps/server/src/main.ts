import "reflect-metadata";
import { resolve } from "node:path";
import { config } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ApiExceptionFilter } from "./api-exception.filter";

config({ path: resolve(__dirname, "../../../.env") });

async function bootstrap() {
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: process.env.NODE_ENV === "production" ? false : true,
    credentials: true
  });

  if (process.env.NODE_ENV !== "production") {
    const { DocumentBuilder, SwaggerModule } = await import("@nestjs/swagger");
    const swagger = new DocumentBuilder()
      .setTitle("FATBOY Inventory API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
}

void bootstrap();
