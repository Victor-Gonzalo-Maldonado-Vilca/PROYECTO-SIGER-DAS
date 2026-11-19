-- =====================================================================
-- SIGER - Ajustes para ILA-0001 / CU-TAL-01 «Aperturar Orden de Servicio».
--
-- 1. INT-001 captura del cliente solo nombres (INP-01) y teléfono (INP-02):
--    el documento (DNI/RUC) pasa a ser opcional en tab_cliente.
-- 2. INT-001 captura de la moto solo placa, color y modelo: marca, año, motor
--    y chasis pasan a ser opcionales (son obligatorios en ILA-0012, venta de
--    motos, y ese caso de uso los sigue validando). Toda moto debe poder
--    identificarse por su placa o por su motor y chasis.
-- 3. RN-TAL-02: orden activa = «Recepcionado» o «En Proceso».
-- 4. RN-TAL-01: N.° de orden correlativo y único ANUAL (ORD-AAAA-XXXX), sin
--    huecos, con un contador por año en lugar de una SEQUENCE.
-- 5. Tab_trazabilidad: el registro inicial de la orden no tiene estado anterior.
--
-- Si la BD ya existía, aplicar con:
--   docker exec -i siger-db psql -U siger -d db_siger < db/init/007_recepcion_ordenes.sql
-- =====================================================================
BEGIN;

-- 1. Cliente con documento opcional (ambos campos juntos o ninguno)
ALTER TABLE tab_cliente ALTER COLUMN tipo_documento   DROP NOT NULL;
ALTER TABLE tab_cliente ALTER COLUMN numero_documento DROP NOT NULL;
ALTER TABLE tab_cliente ADD CONSTRAINT ck_cliente_documento_completo
    CHECK ((tipo_documento IS NULL) = (numero_documento IS NULL));

-- 2. Moto registrada en la recepción del taller
ALTER TABLE tab_moto ALTER COLUMN marca         DROP NOT NULL;
ALTER TABLE tab_moto ALTER COLUMN anio          DROP NOT NULL;
ALTER TABLE tab_moto ALTER COLUMN numero_motor  DROP NOT NULL;
ALTER TABLE tab_moto ALTER COLUMN numero_chasis DROP NOT NULL;
ALTER TABLE tab_moto ALTER COLUMN color         DROP NOT NULL;
ALTER TABLE tab_moto ALTER COLUMN modelo        DROP NOT NULL;
ALTER TABLE tab_moto ADD CONSTRAINT ck_moto_identificable
    CHECK (placa IS NOT NULL OR (numero_motor IS NOT NULL AND numero_chasis IS NOT NULL));

-- 3. Una sola orden activa por moto (RN-TAL-02)
DROP INDEX uq_os_orden_activa_por_moto;
CREATE UNIQUE INDEX uq_os_orden_activa_por_moto ON tab_os (moto_id)
    WHERE estado IN ('RECEPCIONADO', 'EN_PROCESO');

-- 4. Correlativo anual sin huecos (RN-TAL-01)
CREATE TABLE tab_correlativo_anual (
    entidad        VARCHAR(20) NOT NULL,
    anio           INT         NOT NULL,
    ultimo_numero  INT         NOT NULL CHECK (ultimo_numero >= 0),
    PRIMARY KEY (entidad, anio)
);

-- Devuelve el siguiente número del año en curso. El INSERT ... ON CONFLICT DO UPDATE
-- bloquea la fila del contador hasta el COMMIT: dos registros simultáneos reciben
-- números consecutivos y, si una transacción hace ROLLBACK, su número se reutiliza.
CREATE FUNCTION siguiente_correlativo(p_entidad TEXT) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_numero INT;
BEGIN
    INSERT INTO tab_correlativo_anual (entidad, anio, ultimo_numero)
    VALUES (p_entidad, EXTRACT(YEAR FROM NOW())::INT, 1)
    ON CONFLICT (entidad, anio)
        DO UPDATE SET ultimo_numero = tab_correlativo_anual.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;
    RETURN v_numero;
END;
$$;

-- El contador continúa desde la última orden ya registrada este año.
INSERT INTO tab_correlativo_anual (entidad, anio, ultimo_numero)
SELECT 'ORDEN_SERVICIO', EXTRACT(YEAR FROM NOW())::INT,
       COALESCE(MAX(SPLIT_PART(nro_orden, '-', 3)::INT), 0)
FROM tab_os
WHERE nro_orden LIKE 'ORD-' || EXTRACT(YEAR FROM NOW())::INT || '-%';

-- ORD-AAAA-XXXX (con más de 4 dígitos si se superan 9999 órdenes en el año)
CREATE FUNCTION siguiente_nro_orden() RETURNS VARCHAR
LANGUAGE plpgsql AS $$
DECLARE
    v_numero INT := siguiente_correlativo('ORDEN_SERVICIO');
BEGIN
    RETURN 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_numero::TEXT, GREATEST(4, LENGTH(v_numero::TEXT)), '0');
END;
$$;
ALTER TABLE tab_os ALTER COLUMN nro_orden SET DEFAULT siguiente_nro_orden();
DROP SEQUENCE seq_orden_servicio;

-- 5. Registro inicial en la trazabilidad
ALTER TABLE tab_trazabilidad ALTER COLUMN estado_anterior DROP NOT NULL;

COMMIT;
