# Plan de creación — FATBOY Sistema de Inventario

## Orden obligatorio

### Fase 0 — Documentación primaria

Antes de escribir código:

- Crear `PLAN_IMPLEMENTACION_FATBOY_INVENTARIO.md` en la raíz.
- Copiar en él este plan completo, arquitectura, fases, reglas, pruebas y criterios de aceptación.
- Registrar las decisiones posteriores actualizando primero este documento.
- No instalar dependencias, generar estructura ni implementar módulos hasta que el archivo exista.

### Fase 1 — Fundación

- Monorepo npm workspaces con `apps/web`, `apps/server` y `packages/shared`.
- React, Vite y TypeScript para frontend.
- NestJS, Prisma y PostgreSQL para backend.
- Un Dockerfile multi-stage; NestJS servirá `/api/*` y el frontend compilado.
- Configurar migraciones, Swagger, variables de entorno, validación compartida y datos iniciales.
- CSS Modules y variables CSS; no agregar un framework visual innecesario.

### Fase 2 — Diseño responsive

- Una sola aplicación adaptable; no crear proyectos separados para escritorio y móvil.
- Escritorio: sidebar oscura, topbar, selector de sucursal, tarjetas KPI, filtros y tablas densas.
- Tableta: sidebar plegable y tablas simplificadas.
- Móvil: navegación inferior según rol, cards, controles de al menos 44 px y acción principal fija.
- Mantener la identidad azul oscuro, blanca y roja, jerarquía, badges y bordes de la referencia.
- Usar logotipo y activos reales, sin recortarlos de la captura.
- Incluir contraste AA, foco visible, teclado, etiquetas y estados de carga, vacío, error y conexión.

### Fase 3 — Autenticación y catálogos

- Login por correo, JWT corto y refresh token rotativo HttpOnly.
- Permisos backend para `ADMIN`, `MANAGER` y `DRIVER`, con alcance por sucursal.
- Usuarios, sucursales, unidades, categorías, productos y productos por ubicación.
- Desactivar entidades con historial en lugar de eliminarlas.
- Provisionar `SYSTEM_OWNER` mediante secretos de entorno, no visible ni administrable desde la UI normal.
- Auditar todas sus acciones; tampoco podrá borrar movimientos o historiales inmutables.

### Fase 4 — Núcleo de inventario

- Implementar `InventoryBalance` e `InventoryMovement`.
- Centralizar cambios en `InventoryService.applyMovementTx`.
- Ningún módulo podrá modificar balances directamente.
- Movimiento y balance se actualizarán en la misma transacción.
- Las correcciones serán movimientos compensatorios o reversos.
- Construir stock actual, historial y trazabilidad hacia el documento origen.

### Fase 5 — Conteos

- Snapshot inicial y máximo un conteo activo por sucursal.
- Captura móvil sin mostrar stock; cero válido y vacío pendiente.
- Autosave local en IndexedDB y sincronización con `clientMutationId` y versión.
- El backend devolverá siempre el estado canónico.
- No permitir confirmación offline.
- Al confirmar, aplicar `contado - snapshot` sobre el balance actual sin perder movimientos concurrentes.

### Fase 6 — Solicitudes, surtidos y reparto

- Solicitudes en borrador, enviadas, parciales, completas y canceladas.
- Mantener cantidades solicitadas, enviadas y recibidas por separado.
- Crear surtidos desde solicitudes o directamente.
- Asignación de repartidor y flujo móvil: asignado, en ruta y entregado.
- El repartidor no podrá cambiar productos, cantidades ni destino.
- El origen del surtido será informativo en el MVP y no descontará stock.

### Fase 7 — Recepciones e incidencias

- Capturar recibido, no recibido, daño, motivo y observación por producto.
- Confirmar en una sola transacción:
  - validar estado;
  - crear movimientos;
  - actualizar balances;
  - actualizar cumplimiento;
  - generar incidencias;
  - cerrar la recepción.
- Solo la cantidad recibida atenderá la solicitud.
- Los faltantes continuarán pendientes.
- Recepciones confirmadas, movimientos y auditoría serán inmutables.

### Fase 8 — Administración y entrega

- Dashboards por rol.
- Reportes operativos, incidencias y auditoría.
- PWA instalable, caché del shell e indicador offline.
- Logs estructurados, health check, rate limiting y backups PostgreSQL.
- Migraciones y despliegue reproducible.

## Contratos públicos

- Mantener `/api` para auth, usuarios, ubicaciones, catálogos, inventario, conteos, solicitudes, surtidos, incidencias, dashboard, reportes y auditoría.
- Usar `Idempotency-Key` para cierre de conteos, recepciones, ajustes y transiciones críticas.
- Representar cantidades como strings decimales.
- Validarlas según `allowDecimals` y `decimalPlaces`.
- Responder errores con `code`, mensaje operativo, errores de campo y estado vigente en conflictos.
- TanStack Query e IndexedDB serán caché y borrador; PostgreSQL y el backend serán la única fuente de verdad.

## Pruebas y aceptación

- Pruebas de dominio para movimientos, conteos, recepciones parciales y estados.
- Integración con PostgreSQL real para transacciones, rollback y restricciones.
- Concurrencia: doble recepción, doble cierre, ajustes simultáneos e idempotencia.
- Seguridad: roles, sucursales, sesiones, rate limiting y `SYSTEM_OWNER`.
- Navegador en escritorio y móvil, incluyendo desconexión y sincronización.
- Comparación visual a 1536×1024 y móvil a 390×844.
- Gate final:

`producto → asignación → conteo → solicitud → surtido → reparto → recepción parcial → movimiento → stock → incidencia → trazabilidad`

## Límites del MVP

- Sin Redis, microservicios, GPS, POS, compras, importación masiva ni notificaciones externas.
- Imágenes de producto opcionales mediante URL; sin almacenamiento binario propio inicialmente.
- No comenzar la implementación hasta dejar este plan documentado en `PLAN_IMPLEMENTACION_FATBOY_INVENTARIO.md`.

## Decisiones registradas durante la implementación

- La navegación del frontend usa la History API nativa. Se evitó agregar un router que no era necesario para las rutas actuales y cuya versión evaluada introducía alertas de seguridad.
- Swagger queda disponible únicamente en desarrollo. El servidor de producción no carga esa dependencia.
- Los productos iniciales y la marca usan activos PNG locales creados para el sistema; la base de datos conserva solo sus URL.
- PostgreSQL y los servicios de dominio son la autoridad. TanStack Query, el service worker e IndexedDB solo mantienen caché y borradores.
- La verificación local usa una instancia PostgreSQL aislada en el puerto `55432`; no modifica instalaciones o bases de datos existentes del equipo.
- Importación masiva, exportación y paginación avanzada permanecen fuera del MVP según los límites anteriores.
