import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthGuard, RolesGuard } from "./auth/auth.guard";
import { PrismaService } from "./prisma.service";
import { CatalogController } from "./catalog/catalog.controller";
import { InventoryController } from "./inventory/inventory.controller";
import { InventoryService } from "./inventory/inventory.service";
import { OperationsController } from "./operations/operations.controller";
import { OperationsService } from "./operations/operations.service";
import { HealthController } from "./health.controller";
import { ProductImagesController } from "./product-images.controller";

const jwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET debe tener al menos 32 caracteres en producción");
}

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: jwtSecret ?? "development-only-change-me",
      signOptions: { expiresIn: "15m" }
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])
  ],
  controllers: [
    AuthController,
    CatalogController,
    ProductImagesController,
    InventoryController,
    OperationsController
    ,
    HealthController
  ],
  providers: [
    PrismaService,
    AuthService,
    AuthGuard,
    RolesGuard,
    InventoryService,
    OperationsService
  ]
})
export class AppModule {}
