-- Encargado supervisor: permisos de encargado en todas las sucursales y además
-- puede llevar repartos como chofer.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISOR';
