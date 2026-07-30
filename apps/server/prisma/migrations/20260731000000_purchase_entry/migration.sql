-- Entradas de mercancía comprada: se registran como un tipo de movimiento
-- propio para poder separarlas de los ajustes manuales en los reportes.
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'PURCHASE_ENTRY';
