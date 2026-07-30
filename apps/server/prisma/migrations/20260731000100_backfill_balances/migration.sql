-- Catálogo único: toda sucursal activa debe tener saldo (aunque sea cero) de
-- todo producto activo, para que aparezca en conteos y en la vista de stock.
INSERT INTO "InventoryBalance" ("id", "locationId", "productId", "quantity", "version", "updatedAt")
SELECT gen_random_uuid()::text, l."id", p."id", 0, 0, NOW()
FROM "Location" l
CROSS JOIN "Product" p
WHERE l."active" = true AND p."active" = true
ON CONFLICT ("locationId", "productId") DO NOTHING;
