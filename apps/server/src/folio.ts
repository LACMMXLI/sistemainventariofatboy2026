/**
 * Folios legibles para trazabilidad.
 *
 * El `id` de cada registro es un cuid: sirve para las relaciones pero no se
 * puede dictar por teléfono ni buscar a mano. El folio es el identificador con
 * el que la operación habla: "el surtido SUR-2026-00042".
 */

export type FolioKind =
  | "USR" // Usuario
  | "SUC" // Sucursal
  | "CAT" // Categoría
  | "UNI" // Unidad
  | "PRD" // Producto
  | "CON" // Conteo
  | "SOL" // Solicitud
  | "SUR" // Surtido
  | "INC"; // Incidencia

/**
 * Los documentos de operación llevan el año en la serie y reinician cada enero;
 * el catálogo maestro es de vida larga y lleva una numeración corrida.
 */
const YEARLY = new Set<FolioKind>(["CON", "SOL", "SUR", "INC"]);

const PAD = 5;

/** Cliente de Prisma o cliente de transacción: ambos exponen `$queryRaw`. */
type RawClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export function folioSeries(kind: FolioKind, when = new Date()) {
  return YEARLY.has(kind) ? `${kind}-${when.getFullYear()}` : kind;
}

/**
 * Reserva el siguiente folio de la serie.
 *
 * El INSERT ... ON CONFLICT DO UPDATE ... RETURNING es una sola sentencia, así
 * que Postgres serializa las altas concurrentes sobre la fila del contador y
 * dos usuarios nunca reciben el mismo número.
 *
 * Conviene llamarlo con el cliente de la transacción donde se crea el registro:
 * si la operación falla, el contador se revierte con ella.
 */
export async function nextFolio(client: RawClient, kind: FolioKind): Promise<string> {
  const series = folioSeries(kind);
  const rows = await client.$queryRaw<{ value: number }[]>`
    INSERT INTO "FolioCounter" ("key", "value")
    VALUES (${series}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "FolioCounter"."value" + 1
    RETURNING "value"
  `;
  return `${series}-${String(rows[0].value).padStart(PAD, "0")}`;
}
