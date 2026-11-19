-- =====================================================================
-- SIGER - MOD-02 Órdenes de Servicio (mínimo) + MOD-04 Proforma (mínimo)
-- + ConformidadServicio (ILA-0075, EDU-0019).
-- Nombres según Vista Lógica v01.01, Tabla 21.
--
-- Si la BD ya existía, aplicar con:
--   docker exec -i siger-db psql -U siger -d db_siger < db/init/003_ordenes_conformidad.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- OrdenServicio (Tab_orden_servicio / tab_OS)
-- Estados: Vista Lógica (EstadoOrden) + POR_ENTREGAR, que aparece en el
-- diagrama de estados de la orden y en ILA-0075 pero no en el enum de la
-- Vista Lógica (pendiente de uniformar en el catálogo).
-- ---------------------------------------------------------------------
CREATE SEQUENCE seq_orden_servicio;

CREATE TABLE tab_os (
    id                SERIAL       PRIMARY KEY,
    nro_orden         VARCHAR(20)  NOT NULL UNIQUE
                      DEFAULT ('ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('seq_orden_servicio')::TEXT, 4, '0')),
    tipo_servicio     VARCHAR(15)  NOT NULL CHECK (tipo_servicio IN ('MANTENIMIENTO', 'REPARACION')),
    descripcion       VARCHAR(500) NOT NULL,
    fecha_recepcion   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    estado            VARCHAR(15)  NOT NULL DEFAULT 'RECEPCIONADO'
                      CHECK (estado IN ('RECEPCIONADO', 'EN_PROCESO', 'POR_ENTREGAR', 'FINALIZADO', 'ENTREGADO', 'CANCELADO')),
    cliente_id        INT          NOT NULL REFERENCES tab_cliente(id),
    moto_id           INT          NOT NULL REFERENCES tab_moto(id),
    version           INT          NOT NULL DEFAULT 1
);
-- { una sola orden activa por placa/moto } (ESP-0001)
CREATE UNIQUE INDEX uq_os_orden_activa_por_moto ON tab_os (moto_id)
    WHERE estado IN ('RECEPCIONADO', 'EN_PROCESO', 'POR_ENTREGAR', 'FINALIZADO');

-- HistorialEstado (Tab_trazabilidad): bitácora de transiciones de la orden
CREATE TABLE tab_trazabilidad (
    id               BIGSERIAL    PRIMARY KEY,
    orden_id         INT          NOT NULL REFERENCES tab_os(id) ON DELETE CASCADE,
    estado_anterior  VARCHAR(15)  NOT NULL,
    estado_nuevo     VARCHAR(15)  NOT NULL,
    usuario_id       INT          NOT NULL REFERENCES tab_usuario(id),
    fecha_hora       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Proforma (tab_P) y DetalleProforma (tab_DP) — mínimo para ILA-0075.
-- ---------------------------------------------------------------------
CREATE TABLE tab_p (
    id          SERIAL        PRIMARY KEY,
    fecha       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    estado      VARCHAR(10)   NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
    total       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    cliente_id  INT           NOT NULL REFERENCES tab_cliente(id),
    orden_id    INT           REFERENCES tab_os(id)
);

CREATE TABLE tab_dp (
    id            SERIAL        PRIMARY KEY,
    proforma_id   INT           NOT NULL REFERENCES tab_p(id) ON DELETE CASCADE,
    tipo_item     VARCHAR(8)    NOT NULL CHECK (tipo_item IN ('REPUESTO', 'SERVICIO')),
    codigo_item   VARCHAR(30),
    descripcion   VARCHAR(200)  NOT NULL,
    cantidad      INT           NOT NULL CHECK (cantidad > 0),
    costo_unit    NUMERIC(12,2) NOT NULL CHECK (costo_unit >= 0),
    subtotal      NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

-- ---------------------------------------------------------------------
-- ConformidadServicio (tab_CS) — clave foránea ÚNICA a la orden
-- (Tabla 21): una orden tiene a lo sumo una conformidad.
-- ---------------------------------------------------------------------
CREATE SEQUENCE seq_conformidad;

CREATE TABLE tab_cs (
    id                   SERIAL        PRIMARY KEY,
    nro_conformidad      VARCHAR(20)   NOT NULL UNIQUE
                         DEFAULT ('CS-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('seq_conformidad')::TEXT, 4, '0')),
    orden_id             INT           NOT NULL REFERENCES tab_os(id),
    proforma_id          INT           REFERENCES tab_p(id),
    kilometraje          INT           NOT NULL CHECK (kilometraje >= 0),
    trabajos_realizados  TEXT          NOT NULL,
    insumos_empleados    TEXT          NOT NULL,
    precio_total         NUMERIC(12,2) NOT NULL CHECK (precio_total >= 0),
    firma_cliente        BYTEA         NOT NULL,   -- PNG capturado en PAD-01
    fecha_emision        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    usuario_id           INT           NOT NULL REFERENCES tab_usuario(id),
    CONSTRAINT uq_cs_orden UNIQUE (orden_id)
);
