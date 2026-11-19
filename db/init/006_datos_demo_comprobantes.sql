-- =====================================================================
-- SIGER - Datos de DEMOSTRACIÓN para ILA-0018 (solo desarrollo).
-- Crea transacciones facturables de clientes persona natural (DNI):
--   * una venta de moto con cliente y precio (ILA-0017 aún no existe), y
--   * una orden de servicio FINALIZADA con conformidad y proforma aprobada.
-- Además, una venta a un cliente con RUC, que NO debe aparecer (es factura).
--
-- Si la BD ya existía, aplicar con:
--   docker exec -i siger-db psql -U siger -d db_siger < db/init/006_datos_demo_comprobantes.sql
-- =====================================================================
BEGIN;

-- Venta de moto CON_CLIENTE a persona natural (DNI 70123456)
WITH moto AS (
    INSERT INTO tab_moto (marca, modelo, anio, color, numero_motor, numero_chasis)
    VALUES ('Honda', 'Wave 110', 2026, 'Blanco', 'DEMO-MOT-0101', 'DEMO-CHS-0101')
    RETURNING id
)
INSERT INTO tab_venta_moto (precio, estado, moto_id, cliente_id, usuario_id)
SELECT 5490.00, 'CON_CLIENTE', moto.id, c.id, u.id
FROM moto, tab_cliente c, tab_usuario u
WHERE c.numero_documento = '70123456' AND u.usuario = 'gerente';

-- Venta de moto CON_CLIENTE a persona jurídica (RUC): requiere FACTURA, no boleta
WITH moto AS (
    INSERT INTO tab_moto (marca, modelo, anio, color, numero_motor, numero_chasis)
    VALUES ('Bajaj', 'Boxer 150', 2026, 'Negro', 'DEMO-MOT-0102', 'DEMO-CHS-0102')
    RETURNING id
)
INSERT INTO tab_venta_moto (precio, estado, moto_id, cliente_id, usuario_id)
SELECT 4890.00, 'CON_CLIENTE', moto.id, c.id, u.id
FROM moto, tab_cliente c, tab_usuario u
WHERE c.numero_documento = '20456789123' AND u.usuario = 'gerente';

-- Orden FINALIZADA con proforma aprobada y conformidad, cliente DNI 45678912
WITH moto AS (
    INSERT INTO tab_moto (placa, marca, modelo, anio, color, numero_motor, numero_chasis, cliente_id)
    SELECT '7788-JK', 'Honda', 'CB125F', 2024, 'Azul', 'DEMO-MOT-0103', 'DEMO-CHS-0103', c.id
    FROM tab_cliente c WHERE c.numero_documento = '45678912'
    RETURNING id, cliente_id
), orden AS (
    INSERT INTO tab_os (tipo_servicio, descripcion, estado, cliente_id, moto_id)
    SELECT 'MANTENIMIENTO', 'Cambio de aceite y revisión de frenos', 'FINALIZADO', moto.cliente_id, moto.id
    FROM moto
    RETURNING id, cliente_id
), proforma AS (
    INSERT INTO tab_p (estado, total, cliente_id, orden_id)
    SELECT 'APROBADA', 95.00, orden.cliente_id, orden.id FROM orden
    RETURNING id, orden_id
), detalle AS (
    INSERT INTO tab_dp (proforma_id, tipo_item, codigo_item, descripcion, cantidad, costo_unit, subtotal)
    SELECT proforma.id, d.tipo, d.codigo, d.descripcion, d.cantidad, d.costo, d.cantidad * d.costo
    FROM proforma, (VALUES
        ('SERVICIO', 'SRV-MANT',  'Mano de obra',            1, 40.00),
        ('REPUESTO', 'ACE-20W50', 'Aceite 20W-50 (1 L)',     1, 35.00),
        ('REPUESTO', 'PAS-FRE',   'Pastillas de freno',      1, 20.00)
    ) AS d(tipo, codigo, descripcion, cantidad, costo)
)
INSERT INTO tab_cs (orden_id, proforma_id, kilometraje, trabajos_realizados, insumos_empleados,
                    precio_total, firma_cliente, usuario_id)
SELECT proforma.orden_id, proforma.id, 8200, 'Mano de obra', 'Aceite 20W-50 (1 L); Pastillas de freno', 95.00,
       -- PNG de 1x1 como firma de demostración
       decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
       u.id
FROM proforma, tab_usuario u WHERE u.usuario = 'gerente';

COMMIT;
