# Mapa operativo del sistema para agentes de IA

Actualizado: 2026-07-29  
Repositorio: `D:\sistemainventario`  
Proyecto en codebase-memory-mcp: `sistemainventario`

## Cómo empezar sin releer todo

1. Leer este archivo.
2. Consultar el grafo `sistemainventario` con `search_graph`.
3. Antes de cambiar un símbolo compartido, usar `trace_path` en ambas direcciones.
4. Leer sólo los símbolos elegidos con `get_code_snippet`.
5. Usar búsqueda de texto únicamente para literales, CSS, configuración o si el grafo no alcanza.

El índice completo verificado contiene 863 nodos y 1,865 relaciones. Si otro entorno no encuentra el proyecto, reindexar una vez:

```text
index_repository(
  repo_path="D:\sistemainventario",
  name="sistemainventario",
  mode="full",
  persistence=true
)
```

Después de cambios estructurales, repetir esa indexación. Para cambios pequeños, basta reindexar al terminar la solicitud.

## Resumen en una frase

Monorepo npm de una PWA React/Vite y una API NestJS/Prisma/PostgreSQL para productos, inventario, conteos, solicitudes, surtidos, reparto, recepción, incidencias, usuarios, auditoría y reportes.

## Arquitectura real

```text
Navegador / PWA
  apps/web/src/App.tsx          sesión, shell, navegación y autorización visual
  apps/web/src/pages.tsx        todas las pantallas operativas
  apps/web/src/api.ts           único cliente HTTP y renovación de sesión
  apps/web/src/offline.ts       IndexedDB, sólo borradores de conteo
  apps/web/src/styles.css       diseño global y responsive
            |
            | /api, bearer access token + cookie refresh
            v
API NestJS
  auth controller/service/guards
  catalog controller
  inventory controller/service
  operations controller/service
            |
            | PrismaService + transacciones
            v
PostgreSQL
  apps/server/prisma/schema.prisma
  apps/server/prisma/migrations/
```

La API usa el prefijo global `/api`. En desarrollo: API `:3000`, Swagger `/api/docs`, Vite `:5173`. En producción Nest también sirve `apps/web/dist`.

## Autoridades que no se deben romper

- PostgreSQL y la API son la única fuente de verdad. React Query es caché; IndexedDB sólo guarda capturas de conteo pendientes.
- Todo cambio de existencias debe pasar por `InventoryService.applyMovementTx`.
- `InventoryMovement` es historial inmutable; una corrección genera otro movimiento compensatorio.
- `InventoryBalance.version` protege actualizaciones concurrentes y no permite saldo negativo.
- Capturar una línea de conteo usa `version` y `clientMutationId`; completar conteo y recibir surtido exigen `Idempotency-Key`.
- Los cambios multi-entidad de conteos y recepciones deben conservar sus transacciones Prisma.
- Un `MANAGER` queda limitado a su `locationId`; las comprobaciones centrales viven en `OperationsService.assertLocation` y `scopedLocation`.
- El backend decide permisos y transiciones de estado. Ocultar botones en React no sustituye guards ni validaciones.
- Cantidades persistidas son `Decimal(18,4)`; no convertir reglas de negocio a aritmética flotante.

## Mapa de cambios por solicitud

| Solicitud | Empezar aquí | Después revisar |
|---|---|---|
| Rediseño general, colores, responsive | `apps/web/src/styles.css` | `App.tsx` para shell; `pages.tsx` para markup |
| Navegación, menú, visibilidad por rol | `apps/web/src/App.tsx` (`Shell`, `RouteContent`) | `router.tsx`, guards backend si cambia permiso real |
| Pantalla o formulario existente | función de página en `apps/web/src/pages.tsx` | llamada correspondiente en `api.ts` y endpoint backend |
| Nueva pantalla | `pages.tsx` + `App.tsx/RouteContent` | menú en `Shell`; no crear otro router |
| Login, sesión o renovación | `apps/server/src/auth/*` | `apps/web/src/api.ts`, `App.tsx` |
| Roles y acceso por sucursal | `auth/auth.guard.ts` | decorators `@Roles`, `OperationsService.assertLocation/scopedLocation` |
| Productos, unidades, categorías, usuarios | `catalog/catalog.controller.ts` | `packages/shared/src/index.ts`, Prisma schema |
| Stock, historial o ajuste manual | `inventory/inventory.service.ts` | controller, páginas de inventario/reportes |
| Conteos | `operations/operations.service.ts` | controller, `CountCapturePage`, `offline.ts`, modelos StockCount |
| Solicitudes de insumos | `OperationsService` métodos `*Request` | `RequestsPage`, modelos SupplyRequest |
| Surtido, reparto o recepción | `OperationsService` métodos `*Transfer` | `TransfersPage`, `ReceivingPage`, modelos Transfer |
| Incidencias | `OperationsService.listIncidents/resolveIncident` | `IncidentsPage`, modelo Incident |
| Dashboard o reportes | `OperationsService.dashboard` y controller `report` | `DashboardPage`, `ReportsPage` |
| Persistencia o relaciones | `apps/server/prisma/schema.prisma` | crear migración; actualizar seed y tipos afectados |
| Validación compartida | `packages/shared/src/index.ts` | consumidores web y server |
| PWA, assets o caché | `apps/web/vite.config.ts` | `offline.ts`; API debe seguir `NetworkOnly` |
| Arranque, seguridad HTTP, Swagger | `apps/server/src/main.ts`, `app.module.ts` | `.env.example`, Docker |
| Despliegue/contenedores | `Dockerfile`, `docker-compose.yml` | scripts raíz, migraciones, `.env.example` |
| Respaldos | `scripts/backup.ps1` | variables de entorno y tarea programada |

## Frontend

Stack: React 19, TypeScript, Vite, TanStack Query, Tabler Icons y `vite-plugin-pwa`. No hay biblioteca de componentes ni router externo.

### Rutas de pantalla

| URL | Componente |
|---|---|
| `/` | `DashboardPage` |
| `/productos` | `ProductsPage` |
| `/stock` | `InventoryPage` |
| `/conteos` | `CountsPage` |
| `/conteos/:id` | `CountCapturePage` |
| `/solicitudes` | `RequestsPage` |
| `/surtidos` | `TransfersPage` |
| `/repartos` | `TransfersPage driverMode` |
| `/recepciones` | `ReceivingPage` |
| `/incidencias` | `IncidentsPage` |
| `/reportes` | `ReportsPage` |
| `/usuarios` | `UsersPage` |
| `/auditoria` | `AuditPage` |
| `/configuracion` | `ConfigPage` |

### Archivos clave

- `App.tsx`: `useApp`, login, usuario actual, sucursal seleccionada, menú por rol, shell y tabla de rutas.
- `pages.tsx`: contiene las pantallas y la mayoría de mutaciones/query keys. Es grande; localizar primero el componente por nombre en el grafo.
- `api.ts`: `request` añade token, usa `credentials: include`, intenta una renovación y normaliza errores.
- `router.tsx`: router mínimo basado en History API. Extenderlo; no instalar otro router salvo necesidad comprobada.
- `offline.ts`: IndexedDB `fatboy-inventory`, almacén `count-drafts`.
- `types.ts`: formas de respuesta consumidas por UI.
- `styles.css`: sistema visual completo, layouts, estados y media queries.

El service worker trata `/api/` como `NetworkOnly`. La capacidad offline deliberada es capturar borradores de líneas; confirmar el conteo requiere conexión.

## Backend

Stack: NestJS 11, Prisma 7, PostgreSQL, Zod, JWT, bcrypt, Helmet y throttling.

### Entrada y módulos

- `src/main.ts`: prefijo `/api`, Helmet, cookies, ValidationPipe, filtro global, CORS y Swagger sólo fuera de producción.
- `src/app.module.ts`: registra controllers/services, JWT global, límite de 100 solicitudes/minuto y estáticos del build web.
- `src/prisma.service.ts`: conexión y ciclo de vida de Prisma.
- `src/api-exception.filter.ts`: formato común de errores.

### Endpoints por controlador

- `HealthController`: `GET /api/health`.
- `AuthController` (`/api/auth`): login, refresh, logout y `me`.
- `CatalogController`: locations, units, categories, products, asignación producto-sucursal y administración de usuarios.
- `InventoryController` (`/api/inventory`): balances, movimientos por producto/sucursal y ajustes manuales.
- `OperationsController`: dashboard, counts, requests, transfers, incidents, audit y `reports/summary`.

Para ver el método HTTP exacto, buscar el método del controller y leer su decorator. Los controllers son adaptadores delgados salvo `CatalogController`, que actualmente contiene acceso Prisma y auditoría directamente.

### Servicios y flujo

- `AuthService`: verifica contraseña, actualiza último acceso, emite access/refresh y revoca sesiones.
- `InventoryService.applyMovementTx`: punto único para saldo + movimiento, con control optimista.
- `OperationsService`: autoridad de procesos y estados:
  - conteo: iniciar → capturar líneas → completar/cancelar;
  - solicitud: borrador → pendiente → parcial/completa/cancelada;
  - surtido: preparar → asignar → en ruta → entregado → recibido con/sin diferencias;
  - recepción: acredita inventario, actualiza solicitud y crea incidencia si existe diferencia;
  - auditoría, dashboard y resumen de reportes.

## Datos

Archivo autoritativo: `apps/server/prisma/schema.prisma`. La migración inicial está en `apps/server/prisma/migrations/20260728000000_init/migration.sql`.

Grupos principales:

- Identidad: `User`, `RefreshSession`.
- Catálogo: `Location`, `Unit`, `Category`, `Product`, `LocationProduct`.
- Inventario: `InventoryBalance`, `InventoryMovement`.
- Conteos: `StockCount`, `StockCountLine`, `CountLineMutation`.
- Abasto: `SupplyRequest`, `SupplyRequestLine`.
- Distribución: `Transfer`, `TransferLine`.
- Control: `Incident`, `AuditLog`, `IdempotencyRecord`.

Estados importantes:

- Roles: `SYSTEM_OWNER`, `ADMIN`, `MANAGER`, `DRIVER`.
- Conteo: `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Solicitud: `DRAFT`, `PENDING`, `PARTIAL`, `COMPLETED`, `CANCELLED`.
- Surtido: `DRAFT`, `PREPARING`, `ASSIGNED`, `IN_ROUTE`, `DELIVERED`, `RECEIVED`, `RECEIVED_WITH_DIFFERENCES`, `CANCELLED`.

No editar sólo el schema: cualquier cambio persistente requiere una migración Prisma revisable.

## Símbolos de alto impacto

Consultar sus rutas antes de tocarlos:

- `apps.web.src.App.Page`: fan-in 13.
- `apps.web.src.App.useApp`: fan-in 11.
- `OperationsService.assertLocation`: fan-in 9.
- `pages.Status` y `App.Empty`: fan-in 8.
- `api.request`: concentra todas las llamadas HTTP.
- `OperationsService.receiveTransfer`: mayor complejidad backend observada; afecta recepción, inventario, solicitudes e incidencias.
- `App.RouteContent`: concentra las 14 decisiones de pantalla.

Ejemplos de consulta:

```text
search_graph(project="sistemainventario", query="receive transfer")
trace_path(project="sistemainventario", function_name="OperationsService.receiveTransfer",
           direction="both", mode="calls", depth=3, risk_labels=true)
get_code_snippet(project="sistemainventario",
                 qualified_name="sistemainventario.apps.server.src.operations.operations.service.OperationsService.receiveTransfer")
```

## Pruebas y validación mínima

```powershell
npm test
npm run build
```

Pruebas actuales:

- `apps/server/src/domain.spec.ts`: reglas puras de ajustes y recepción.
- `apps/web/src/quantity.test.ts`: manejo/formato de cantidades.

Para lógica nueva con estados, dinero/cantidades, seguridad o concurrencia, agregar una prueba pequeña en el nivel donde vive la regla. Un cambio sólo documental no requiere ejecutar build.

## Reglas de trabajo para el siguiente agente

- Preservar cambios ajenos y revisar `git status` antes de editar.
- Seguir el flujo UI → API client → controller → service → Prisma antes de decidir el archivo.
- Reusar las pantallas, servicios y rutas actuales; evitar superficies paralelas.
- Mantener validación en el límite de confianza y reglas críticas en backend.
- No guardar ni mostrar secretos. El seed sólo crea cuentas con contraseñas suministradas por entorno.
- Distinguir siempre lo verificado de lo inferido y no afirmar despliegues que no se comprobaron.
- Al terminar un cambio estructural, actualizar este mapa sólo si cambió una ruta, autoridad, módulo o flujo, y refrescar el grafo.
