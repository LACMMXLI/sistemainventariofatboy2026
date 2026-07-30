-- Folios legibles para trazabilidad.
--
-- Los registros que ya existen se numeran en su orden real de creación, de modo
-- que el folio refleje la antigüedad. Después se fija el contador en el último
-- número usado para que las altas nuevas continúen la serie sin colisionar.

CREATE TABLE "FolioCounter" (
  "key"   TEXT    NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FolioCounter_pkey" PRIMARY KEY ("key")
);

-- Catálogo maestro: serie corrida, sin año.
ALTER TABLE "User"     ADD COLUMN "folio" TEXT;
ALTER TABLE "Location" ADD COLUMN "folio" TEXT;
ALTER TABLE "Unit"     ADD COLUMN "folio" TEXT;
ALTER TABLE "Category" ADD COLUMN "folio" TEXT;
ALTER TABLE "Product"  ADD COLUMN "folio" TEXT;

-- Documentos de operación: serie por año.
ALTER TABLE "StockCount"    ADD COLUMN "folio" TEXT;
ALTER TABLE "SupplyRequest" ADD COLUMN "folio" TEXT;
ALTER TABLE "Transfer"      ADD COLUMN "folio" TEXT;
ALTER TABLE "Incident"      ADD COLUMN "folio" TEXT;

-- Numera una tabla de catálogo por orden de creación y deja listo el contador.
CREATE OR REPLACE FUNCTION pg_temp.backfill_flat(tabla TEXT, prefijo TEXT, orden TEXT)
RETURNS void AS $$
DECLARE ultimo INTEGER;
BEGIN
  EXECUTE format(
    'UPDATE %1$I t SET "folio" = %2$L || ''-'' || lpad(n.rn::text, 5, ''0'')
       FROM (SELECT "id", row_number() OVER (ORDER BY %3$s) AS rn FROM %1$I) n
      WHERE t."id" = n."id"',
    tabla, prefijo, orden
  );
  EXECUTE format('SELECT count(*)::int FROM %I', tabla) INTO ultimo;
  INSERT INTO "FolioCounter" ("key", "value") VALUES (prefijo, ultimo)
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
END;
$$ LANGUAGE plpgsql;

-- Numera una tabla de operación reiniciando en cada año natural.
CREATE OR REPLACE FUNCTION pg_temp.backfill_yearly(tabla TEXT, prefijo TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE %1$I t
        SET "folio" = %2$L || ''-'' || n.anio::text || ''-'' || lpad(n.rn::text, 5, ''0'')
       FROM (
         SELECT "id",
                extract(year FROM "createdAt")::int AS anio,
                row_number() OVER (
                  PARTITION BY extract(year FROM "createdAt")
                  ORDER BY "createdAt", "id"
                ) AS rn
           FROM %1$I
       ) n
      WHERE t."id" = n."id"',
    tabla, prefijo
  );
  EXECUTE format(
    'INSERT INTO "FolioCounter" ("key", "value")
     SELECT %2$L || ''-'' || extract(year FROM "createdAt")::int::text, count(*)::int
       FROM %1$I GROUP BY extract(year FROM "createdAt")
     ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"',
    tabla, prefijo
  );
END;
$$ LANGUAGE plpgsql;

SELECT pg_temp.backfill_flat('User',     'USR', '"createdAt", "id"');
SELECT pg_temp.backfill_flat('Location', 'SUC', '"createdAt", "id"');
SELECT pg_temp.backfill_flat('Product',  'PRD', '"createdAt", "id"');
-- Unit y Category no guardan fecha de alta; se ordenan por nombre.
SELECT pg_temp.backfill_flat('Unit',     'UNI', '"name"');
SELECT pg_temp.backfill_flat('Category', 'CAT', '"sortOrder", "name"');

SELECT pg_temp.backfill_yearly('StockCount',    'CON');
SELECT pg_temp.backfill_yearly('SupplyRequest', 'SOL');
SELECT pg_temp.backfill_yearly('Transfer',      'SUR');
SELECT pg_temp.backfill_yearly('Incident',      'INC');

ALTER TABLE "User"          ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "Location"      ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "Unit"          ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "Category"      ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "Product"       ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "StockCount"    ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "SupplyRequest" ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "Transfer"      ALTER COLUMN "folio" SET NOT NULL;
ALTER TABLE "Incident"      ALTER COLUMN "folio" SET NOT NULL;

CREATE UNIQUE INDEX "User_folio_key"          ON "User"("folio");
CREATE UNIQUE INDEX "Location_folio_key"      ON "Location"("folio");
CREATE UNIQUE INDEX "Unit_folio_key"          ON "Unit"("folio");
CREATE UNIQUE INDEX "Category_folio_key"      ON "Category"("folio");
CREATE UNIQUE INDEX "Product_folio_key"       ON "Product"("folio");
CREATE UNIQUE INDEX "StockCount_folio_key"    ON "StockCount"("folio");
CREATE UNIQUE INDEX "SupplyRequest_folio_key" ON "SupplyRequest"("folio");
CREATE UNIQUE INDEX "Transfer_folio_key"      ON "Transfer"("folio");
CREATE UNIQUE INDEX "Incident_folio_key"      ON "Incident"("folio");
