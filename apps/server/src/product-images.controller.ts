import {
  BadRequestException,
  Controller,
  FileTypeValidator,
  Get,
  Logger,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { AuthGuard, type AuthRequest, Roles, RolesGuard } from "./auth/auth.guard";
import { PrismaService } from "./prisma.service";

type UploadedImage = {
  buffer: Buffer;
  mimetype: string;
};

let client: S3Client | undefined;

function storage() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new ServiceUnavailableException("El almacenamiento de imágenes no está configurado");
  }
  client ??= new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId, secretAccessKey }
  });
  return { client, bucket };
}

@Controller()
export class ProductImagesController {
  private readonly logger = new Logger(ProductImagesController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post("products/:id/image")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("SYSTEM_OWNER", "ADMIN")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(
    @Req() request: AuthRequest,
    @Param("id") productId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ })
        ]
      })
    )
    file: UploadedImage
  ) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      throw new BadRequestException("Solo se permiten imágenes JPG, PNG o WebP");
    }
    const before = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!before) throw new NotFoundException("Producto no encontrado");

    const { client, bucket } = storage();
    const imageId = randomUUID();
    const key = `products/${imageId}`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000, immutable"
      }));
    } catch {
      throw new ServiceUnavailableException("No se pudo guardar la imagen");
    }

    const imageUrl = `/api/product-images/${imageId}`;
    let product;
    try {
      product = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id: productId },
          data: { imageUrl }
        });
        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: "UPDATE_IMAGE",
            entityType: "Product",
            entityId: productId,
            beforeData: before as never,
            afterData: updated as never,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"]
          }
        });
        return updated;
      });
    } catch (error) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
      throw error;
    }

    const previousId = before.imageUrl?.match(/^\/api\/product-images\/([0-9a-f-]{36})$/)?.[1];
    if (previousId) {
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: `products/${previousId}` }))
        .catch(() => this.logger.warn(`No se pudo eliminar la imagen anterior ${previousId}`));
    }
    return product;
  }

  @Get("product-images/:id")
  async image(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const { client, bucket } = storage();
    try {
      const object = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: `products/${id}`
      }));
      if (!object.Body) throw new NotFoundException("Imagen no encontrada");
      response.setHeader("Content-Type", object.ContentType ?? "application/octet-stream");
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return new StreamableFile(Buffer.from(await object.Body.transformToByteArray()));
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound")) {
        throw new NotFoundException("Imagen no encontrada");
      }
      throw new ServiceUnavailableException("No se pudo leer la imagen");
    }
  }
}
