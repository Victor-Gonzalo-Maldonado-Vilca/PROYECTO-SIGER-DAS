-- =====================================================================
-- SIGER - MOD-05 Clientes (EDU-0020; fichas CU-CLI-01 a CU-CLI-05)
--
-- 1. CU-CLI-01 paso 3: correo electrónico del cliente (opcional).
-- 2. Fecha de registro, para mostrarla en el detalle (CU-CLI-02).
-- 3. Bloqueo optimista (RNF-0008): versión del registro, para que dos
--    usuarios que editan el mismo cliente no se sobrescriban (CU-CLI-03).
-- 4. Nombre explícito para la restricción única del documento (RN-CLI-01),
--    que la capa de acceso a datos traduce a MSG-102.
-- 5. Índice para buscar por nombre sin distinguir mayúsculas (RNF-0003).
--
-- Si la BD ya existía, aplicar con:
--   docker exec -i siger-db psql -U siger -d db_siger < db/init/008_clientes.sql
-- =====================================================================

BEGIN;

ALTER TABLE tab_cliente ADD COLUMN IF NOT EXISTS correo         VARCHAR(100);
ALTER TABLE tab_cliente ADD COLUMN IF NOT EXISTS fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tab_cliente ADD COLUMN IF NOT EXISTS version        INT         NOT NULL DEFAULT 1;

ALTER TABLE tab_cliente DROP CONSTRAINT IF EXISTS tab_cliente_numero_documento_key;
ALTER TABLE tab_cliente DROP CONSTRAINT IF EXISTS uq_cliente_numero_documento;
ALTER TABLE tab_cliente ADD CONSTRAINT uq_cliente_numero_documento UNIQUE (numero_documento);

CREATE INDEX IF NOT EXISTS ix_cliente_nombre ON tab_cliente (LOWER(nombre_razon_social));

COMMIT;
