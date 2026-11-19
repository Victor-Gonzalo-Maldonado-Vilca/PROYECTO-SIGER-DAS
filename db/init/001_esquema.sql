-- =====================================================================
-- SIGER - db_siger (PostgreSQL 15)
-- Esquema inicial: tablas necesarias para MOD-01 (seguridad), ILA-0012
-- (venta de motos) y auditoría. Los nombres siguen la Tabla 21 de la
-- Vista Lógica v01.01 (forma Tab_xxx en minúsculas).
--
-- Este script se ejecuta automáticamente la PRIMERA vez que se crea el
-- contenedor de PostgreSQL (docker-entrypoint-initdb.d). Para volver a
-- aplicarlo:  docker compose down -v  &&  docker compose up -d
-- =====================================================================

-- ---------------------------------------------------------------------
-- MOD-01 Seguridad y Permisos
-- ---------------------------------------------------------------------
CREATE TABLE tab_modulo (
    codigo         VARCHAR(6)   PRIMARY KEY,           -- MOD-01 ... MOD-09
    nombre         VARCHAR(80)  NOT NULL,
    es_financiero  BOOLEAN      NOT NULL DEFAULT FALSE  -- Costos, Ganancias y Planillas
);

CREATE TABLE tab_perfil_permiso (
    id             SERIAL       PRIMARY KEY,
    codigo         VARCHAR(10)  NOT NULL UNIQUE,
    nombre_perfil  VARCHAR(60)  NOT NULL UNIQUE,
    rol_asociado   VARCHAR(10)  NOT NULL CHECK (rol_asociado IN ('GERENTE', 'VENDEDOR', 'MECANICO')),
    descripcion    VARCHAR(200)
);

-- Lista de módulos habilitados por perfil (asociación PerfilPermiso - Modulo).
CREATE TABLE tab_perfil_modulo (
    perfil_id      INT          NOT NULL REFERENCES tab_perfil_permiso(id) ON DELETE CASCADE,
    modulo_codigo  VARCHAR(6)   NOT NULL REFERENCES tab_modulo(codigo),
    PRIMARY KEY (perfil_id, modulo_codigo)
);

CREATE TABLE tab_usuario (
    id               SERIAL       PRIMARY KEY,
    usuario          VARCHAR(40)  NOT NULL UNIQUE,
    contrasena_hash  VARCHAR(100) NOT NULL,             -- bcrypt, nunca texto plano
    nombre_completo  VARCHAR(120) NOT NULL,
    estado           VARCHAR(8)   NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'INACTIVA')),
    ultimo_ingreso   TIMESTAMPTZ,
    perfil_id        INT          NOT NULL REFERENCES tab_perfil_permiso(id)
);

-- ---------------------------------------------------------------------
-- MOD-05 Clientes (mínimo necesario para la FK de la venta; se completa en ILA-0079)
-- Herencia en tabla única: tipo_documento discrimina PersonaNatural / PersonaJuridica.
-- ---------------------------------------------------------------------
CREATE TABLE tab_cliente (
    id                   SERIAL       PRIMARY KEY,
    tipo_documento       VARCHAR(3)   NOT NULL CHECK (tipo_documento IN ('DNI', 'RUC')),
    numero_documento     VARCHAR(11)  NOT NULL UNIQUE,
    nombre_razon_social  VARCHAR(150) NOT NULL,
    telefono             VARCHAR(15),
    direccion            VARCHAR(200),
    estado               VARCHAR(8)   NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO')),
    CONSTRAINT ck_cliente_longitud_documento CHECK (
        (tipo_documento = 'DNI' AND numero_documento ~ '^[0-9]{8}$') OR
        (tipo_documento = 'RUC' AND numero_documento ~ '^[0-9]{11}$')
    )
);

-- ---------------------------------------------------------------------
-- MOD-02 Moto  { numeroMotor y numeroChasis únicos }
-- ---------------------------------------------------------------------
CREATE TABLE tab_moto (
    id             SERIAL       PRIMARY KEY,
    placa          VARCHAR(10),                         -- una moto nueva aún no tiene placa
    marca          VARCHAR(50)  NOT NULL,
    modelo         VARCHAR(50)  NOT NULL,
    anio           INT          NOT NULL CHECK (anio >= 1900),
    color          VARCHAR(30)  NOT NULL,
    numero_motor   VARCHAR(40)  NOT NULL,
    numero_chasis  VARCHAR(40)  NOT NULL,
    cliente_id     INT          REFERENCES tab_cliente(id),   -- propietario (0..1)
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Los índices únicos refuerzan los pasos 6 y 7 de ILA-0012 ante registros simultáneos.
    CONSTRAINT uq_moto_numero_motor  UNIQUE (numero_motor),
    CONSTRAINT uq_moto_numero_chasis UNIQUE (numero_chasis)
);
CREATE UNIQUE INDEX uq_moto_placa ON tab_moto (placa) WHERE placa IS NOT NULL;

-- ---------------------------------------------------------------------
-- MOD-04 VentaMoto (Tab_venta_moto / Tab_VMO)
-- ---------------------------------------------------------------------
CREATE SEQUENCE seq_venta_moto;

CREATE TABLE tab_venta_moto (
    id           SERIAL        PRIMARY KEY,
    nro_venta    VARCHAR(20)   NOT NULL UNIQUE
                 DEFAULT ('VM-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('seq_venta_moto')::TEXT, 4, '0')),
    fecha        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    precio       NUMERIC(12,2) CHECK (precio IS NULL OR precio > 0),
    estado       VARCHAR(20)   NOT NULL DEFAULT 'SIN_CLIENTE'
                 CHECK (estado IN ('SIN_CLIENTE', 'CON_CLIENTE', 'COMPROBANTE_EMITIDO')),
    moto_id      INT           NOT NULL REFERENCES tab_moto(id),
    cliente_id   INT           REFERENCES tab_cliente(id),   -- se asocia en ILA-0017
    usuario_id   INT           NOT NULL REFERENCES tab_usuario(id),
    version      INT           NOT NULL DEFAULT 1,           -- bloqueo optimista (RNF-0008)
    -- VentaMoto 0..1 -> 1 Moto: una moto se vende una sola vez.
    CONSTRAINT uq_venta_moto_moto UNIQUE (moto_id),
    CONSTRAINT ck_venta_con_cliente CHECK (estado = 'SIN_CLIENTE' OR cliente_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- Auditoría y trazabilidad (Tab_AUD / Tab_auditoria)
-- ---------------------------------------------------------------------
CREATE TABLE tab_auditoria (
    id          BIGSERIAL    PRIMARY KEY,
    usuario_id  INT          NOT NULL REFERENCES tab_usuario(id),
    accion      VARCHAR(60)  NOT NULL,
    entidad     VARCHAR(60)  NOT NULL,
    entidad_id  BIGINT       NOT NULL,
    detalle     JSONB,
    motivo      VARCHAR(300),
    fecha_hora  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_auditoria_entidad ON tab_auditoria (entidad, entidad_id);
