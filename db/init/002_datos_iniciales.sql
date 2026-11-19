-- =====================================================================
-- SIGER - Datos iniciales (catálogos, perfiles y usuarios de DESARROLLO)
--
-- Usuarios de prueba (solo entorno local; cambiar antes de producción):
--   gerente   / Siger2026!   -> perfil GERENTE  (todos los módulos)
--   vendedor  / Siger2026!   -> perfil VENDEDOR
--   mecanico  / Siger2026!   -> perfil MECANICO
--
-- Pendiente (Hito 3, Tabla 7): confirmar la equivalencia entre
-- Administrador (ACT-0001)/Gerente y los perfiles GERENTE/EMPLEADO de RNF-0005.
-- =====================================================================

INSERT INTO tab_modulo (codigo, nombre, es_financiero) VALUES
    ('MOD-01', 'Seguridad y Permisos',   FALSE),
    ('MOD-02', 'Órdenes de Servicio',    FALSE),
    ('MOD-03', 'Inventario y Repuestos', FALSE),
    ('MOD-04', 'Ventas y Proformas',     FALSE),
    ('MOD-05', 'Clientes',               FALSE),
    ('MOD-06', 'Proveedores',            FALSE),
    ('MOD-07', 'Personal / RR.HH.',      TRUE),   -- sueldos y planillas: solo GERENTE
    ('MOD-08', 'Comprobantes de Pago',   FALSE),
    ('MOD-09', 'Financiero y Reportes',  TRUE);   -- costos y ganancias: solo GERENTE

INSERT INTO tab_perfil_permiso (codigo, nombre_perfil, rol_asociado, descripcion) VALUES
    ('PRF-01', 'Gerente',  'GERENTE',  'Administrador del negocio (ACT-0001). Acceso total.'),
    ('PRF-02', 'Vendedor', 'VENDEDOR', 'Ventas de mostrador, motos, proformas y comprobantes.'),
    ('PRF-03', 'Mecánico', 'MECANICO', 'Órdenes de servicio del taller.');

-- GERENTE: todos los módulos
INSERT INTO tab_perfil_modulo (perfil_id, modulo_codigo)
SELECT p.id, m.codigo FROM tab_perfil_permiso p CROSS JOIN tab_modulo m WHERE p.codigo = 'PRF-01';

-- VENDEDOR
INSERT INTO tab_perfil_modulo (perfil_id, modulo_codigo)
SELECT p.id, m.codigo FROM tab_perfil_permiso p, tab_modulo m
WHERE p.codigo = 'PRF-02' AND m.codigo IN ('MOD-03', 'MOD-04', 'MOD-05', 'MOD-08');

-- MECANICO
INSERT INTO tab_perfil_modulo (perfil_id, modulo_codigo)
SELECT p.id, m.codigo FROM tab_perfil_permiso p, tab_modulo m
WHERE p.codigo = 'PRF-03' AND m.codigo IN ('MOD-02', 'MOD-03');

-- Hash bcrypt (10 rondas) de la contraseña de desarrollo indicada arriba.
INSERT INTO tab_usuario (usuario, contrasena_hash, nombre_completo, perfil_id)
SELECT u.usuario, '$2a$10$57reGQwM/.XoTnCL.ykQHOEnbGypTLPmVejwTseUxGV.sNA5ayWUq', u.nombre, p.id
FROM (VALUES
        ('gerente',  'Gerente de prueba',  'PRF-01'),
        ('vendedor', 'Vendedor de prueba', 'PRF-02'),
        ('mecanico', 'Mecánico de prueba', 'PRF-03')
     ) AS u(usuario, nombre, perfil)
JOIN tab_perfil_permiso p ON p.codigo = u.perfil;
