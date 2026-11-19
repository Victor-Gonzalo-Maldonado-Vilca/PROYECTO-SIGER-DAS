-- =====================================================================
-- SIGER - Datos de DEMOSTRACIÓN del taller (solo desarrollo).
-- Mientras no existan ILA-0001 (registrar orden) ni las proformas,
-- estas filas permiten probar ILA-0075 (conformidad de servicio).
-- Las referencias se buscan por DNI/RUC y placa (no por id), para que el
-- script funcione aunque la BD ya tenga otros registros.
--
-- Si la BD ya existía, aplicar con:
--   docker exec -i siger-db psql -U siger -d db_siger < db/init/004_datos_demo_taller.sql
-- =====================================================================
BEGIN;

INSERT INTO tab_cliente (tipo_documento, numero_documento, nombre_razon_social, telefono) VALUES
    ('DNI', '45678912',    'Carlos Pérez Quispe',          '959111222'),
    ('DNI', '70123456',    'María Huamán Torres',          '958333444'),
    ('RUC', '20456789123', 'Transportes El Misti S.A.C.',  '054223344')
ON CONFLICT (numero_documento) DO NOTHING;

INSERT INTO tab_moto (placa, marca, modelo, anio, color, numero_motor, numero_chasis, cliente_id)
SELECT m.placa, m.marca, m.modelo, m.anio, m.color, m.motor, m.chasis, c.id
FROM (VALUES
        ('1234-AB', 'Honda',  'XR150L',       2022, 'Rojo',  'DEMO-MOT-0001', 'DEMO-CHS-0001', '45678912'),
        ('5678-CD', 'Yamaha', 'YBR125',       2021, 'Negro', 'DEMO-MOT-0002', 'DEMO-CHS-0002', '70123456'),
        ('9012-EF', 'Bajaj',  'Pulsar NS200', 2023, 'Azul',  'DEMO-MOT-0003', 'DEMO-CHS-0003', '20456789123'),
        ('3456-GH', 'Suzuki', 'GN125',        2020, 'Gris',  'DEMO-MOT-0004', 'DEMO-CHS-0004', '45678912')
     ) AS m(placa, marca, modelo, anio, color, motor, chasis, doc)
JOIN tab_cliente c ON c.numero_documento = m.doc
ON CONFLICT DO NOTHING;

-- Órdenes: 1234-AB y 5678-CD son APTAS; 9012-EF (proforma pendiente) y 3456-GH (recepcionada) NO.
INSERT INTO tab_os (tipo_servicio, descripcion, estado, cliente_id, moto_id)
SELECT o.tipo, o.descripcion, o.estado, m.cliente_id, m.id
FROM (VALUES
        ('MANTENIMIENTO', 'Mantenimiento de 10 000 km',          'EN_PROCESO',   '1234-AB'),
        ('REPARACION',    'Cambio de kit de arrastre y frenos',  'POR_ENTREGAR', '5678-CD'),
        ('REPARACION',    'Falla eléctrica en el arranque',      'EN_PROCESO',   '9012-EF'),
        ('MANTENIMIENTO', 'Afinamiento general',                 'RECEPCIONADO', '3456-GH')
     ) AS o(tipo, descripcion, estado, placa)
JOIN tab_moto m ON m.placa = o.placa;

INSERT INTO tab_p (estado, total, cliente_id, orden_id)
SELECT p.estado, p.total, os.cliente_id, os.id
FROM (VALUES ('APROBADA', 145.00, '1234-AB'), ('APROBADA', 320.00, '5678-CD'), ('PENDIENTE', 180.00, '9012-EF'))
         AS p(estado, total, placa)
JOIN tab_moto m ON m.placa = p.placa
JOIN tab_os  os ON os.moto_id = m.id;

INSERT INTO tab_dp (proforma_id, tipo_item, codigo_item, descripcion, cantidad, costo_unit, subtotal)
SELECT pr.id, d.tipo, d.codigo, d.descripcion, d.cantidad, d.costo, d.cantidad * d.costo
FROM (VALUES
        ('1234-AB', 'SERVICIO', 'SRV-MANT',  'Mano de obra de mantenimiento', 1,  60.00),
        ('1234-AB', 'REPUESTO', 'ACE-20W50', 'Aceite 20W-50 (1 L)',           1,  35.00),
        ('1234-AB', 'REPUESTO', 'FIL-ACE',   'Filtro de aceite',              1,  25.00),
        ('1234-AB', 'REPUESTO', 'BUJ-NGK',   'Bujía NGK',                     1,  25.00),
        ('5678-CD', 'SERVICIO', 'SRV-REP',   'Mano de obra de reparación',    1, 100.00),
        ('5678-CD', 'REPUESTO', 'KIT-ARR',   'Kit de arrastre',               1, 170.00),
        ('5678-CD', 'REPUESTO', 'PAS-FRE',   'Pastillas de freno',            2,  25.00),
        ('9012-EF', 'SERVICIO', 'SRV-ELEC',  'Diagnóstico eléctrico',         1, 180.00)
     ) AS d(placa, tipo, codigo, descripcion, cantidad, costo)
JOIN tab_moto m ON m.placa = d.placa
JOIN tab_os  os ON os.moto_id = m.id
JOIN tab_p   pr ON pr.orden_id = os.id;

COMMIT;
