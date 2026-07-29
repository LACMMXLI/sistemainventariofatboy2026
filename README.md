# FATBOY Sistema de Inventario

PWA responsive para inventario, conteos, solicitudes, surtidos, reparto y recepción entre sucursales. PostgreSQL y la API NestJS son la única fuente de verdad; el frontend solo conserva caché y borradores de conteo.

## Requisitos

- Node.js 22 o superior.
- PostgreSQL 16 o superior, o Docker.

## Desarrollo local

1. Copiar `.env.example` a `.env` y completar valores seguros.
2. Crear la base indicada por `DATABASE_URL`.
3. Ejecutar:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

En otra terminal:

```powershell
npm run dev:web
```

La API queda en `http://localhost:3000/api`, Swagger en `/api/docs` y Vite en `http://localhost:5173`.

El seed crea o conserva únicamente el usuario dueño definido por
`SYSTEM_OWNER_EMAIL` y `SYSTEM_OWNER_PASSWORD`. No existen contraseñas
predeterminadas en el repositorio.

## Validación

```powershell
npm test
npm run build
```

## Coolify / Docker

Desplegar el repositorio con Docker Compose y definir en Coolify:

- `POSTGRES_PASSWORD`
- `JWT_SECRET` (mínimo 32 caracteres)
- `SYSTEM_OWNER_EMAIL`
- `SYSTEM_OWNER_PASSWORD`

Coolify genera automáticamente `SERVICE_USER_S3` y
`SERVICE_PASSWORD_64_S3`. El Compose usa esas credenciales para crear un
MinIO privado, el bucket `product-images` y el volumen persistente
`object_storage_data`; no deben cambiarse después del primer despliegue.

El dominio debe apuntar al servicio `app`, puerto `3000`. Para probarlo
localmente:

```powershell
docker compose up --build
```

Al iniciar, la aplicación espera a PostgreSQL, ejecuta las migraciones, crea o
conserva al dueño, espera que exista el bucket de imágenes y después levanta la
API. La salud del contenedor se valida en `/api/health`. La consola opcional de
MinIO escucha internamente en el puerto `9001`; no es necesaria para usar las
imágenes desde la aplicación.

## Respaldos

Programar `scripts/backup.ps1` con el Programador de tareas de Windows o el orquestador del servidor. El script usa `pg_dump`, conserva 14 días por defecto y nunca imprime credenciales.

## Autoridad de inventario

Todo cambio de stock debe pasar por `InventoryService.applyMovementTx`. Los movimientos confirmados no se editan ni se eliminan; cualquier corrección crea un movimiento compensatorio.
