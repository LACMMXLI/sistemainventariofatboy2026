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

El seed crea únicamente las cuentas cuyas contraseñas se proporcionen mediante variables de entorno. No existen contraseñas predeterminadas en el repositorio.

## Validación

```powershell
npm test
npm run build
```

## Docker

Definir `POSTGRES_PASSWORD`, `JWT_SECRET` y los secretos de la cuenta superior fuera del repositorio:

```powershell
docker compose up --build
```

La aplicación ejecuta migraciones pendientes antes de iniciar.

## Respaldos

Programar `scripts/backup.ps1` con el Programador de tareas de Windows o el orquestador del servidor. El script usa `pg_dump`, conserva 14 días por defecto y nunca imprime credenciales.

## Autoridad de inventario

Todo cambio de stock debe pasar por `InventoryService.applyMovementTx`. Los movimientos confirmados no se editan ni se eliminan; cualquier corrección crea un movimiento compensatorio.
