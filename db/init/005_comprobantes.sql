-- =====================================================================
-- SIGER - MOD-08 Comprobantes de Pago (EDU-0005, EDU-0018) — ILA-0018
-- Decisiones del Hito 3: PRO-03 (job + tabla de pendientes) y PRO-04
-- (clave estable, salida persistida/outbox, exclusión entre workers y
-- conciliación).
--
-- Si la BD ya existía, aplicar con:
--   docker exec -i siger-db psql -U siger -d db_siger < db/init/005_comprobantes.sql
-- =====================================================================

-- DatosFiscales del emisor (tab_E). Una sola fila: la empresa.
CREATE TABLE tab_e (
    id                SERIAL       PRIMARY KEY,
    razon_social      VARCHAR(150) NOT NULL,
    ruc               VARCHAR(11)  NOT NULL UNIQUE CHECK (ruc ~ '^[0-9]{11}$'),
    direccion_fiscal  VARCHAR(200) NOT NULL
);

-- Correlativo por serie SIN HUECOS: el número se toma con UPDATE ... RETURNING
-- dentro de la transacción; si hay ROLLBACK, el número no se pierde
-- (a diferencia de una SEQUENCE). SUNAT exige numeración correlativa.
CREATE TABLE tab_serie_comprobante (
    tipo_comprobante  VARCHAR(7)  NOT NULL CHECK (tipo_comprobante IN ('BOLETA', 'FACTURA')),
    serie             VARCHAR(4)  NOT NULL,
    ultimo_numero     INT         NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
    PRIMARY KEY (tipo_comprobante, serie)
);

-- Comprobante / Boleta / Factura (Tab_comprobante / Tab_comprobante_oficial).
-- Herencia en tabla única: tipo_comprobante.
-- EstadoComprobante: GENERADO -> EMITIDO (inmutable). RECHAZADO se agrega para
-- registrar un rechazo explícito de SUNAT (Hito 3, Fig. 5 «Rechazo informado»).
CREATE TABLE tab_comprobante_oficial (
    id                      SERIAL        PRIMARY KEY,
    tipo_comprobante        VARCHAR(7)    NOT NULL CHECK (tipo_comprobante IN ('BOLETA', 'FACTURA')),
    serie                   VARCHAR(4)    NOT NULL,
    numero                  INT           NOT NULL CHECK (numero > 0),
    fecha_emision           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    subtotal                NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    igv                     NUMERIC(12,2) NOT NULL CHECK (igv >= 0),
    monto_total             NUMERIC(12,2) NOT NULL CHECK (monto_total > 0),
    estado                  VARCHAR(9)    NOT NULL DEFAULT 'GENERADO'
                            CHECK (estado IN ('GENERADO', 'EMITIDO', 'RECHAZADO')),
    emisor_id               INT           NOT NULL REFERENCES tab_e(id),
    cliente_id              INT           NOT NULL REFERENCES tab_cliente(id),
    -- TransaccionFacturable que liquida (orden de servicio, venta de moto o venta de repuesto)
    tipo_transaccion        VARCHAR(14)   NOT NULL CHECK (tipo_transaccion IN ('VENTA_MOTO', 'ORDEN_SERVICIO', 'VENTA_REPUESTO')),
    transaccion_id          INT           NOT NULL,
    detalle                 JSONB         NOT NULL,   -- ítems tal como se emitieron (fotografía)
    codigo_respuesta_sunat  VARCHAR(10),
    descripcion_respuesta   VARCHAR(300),
    usuario_id              INT           NOT NULL REFERENCES tab_usuario(id),
    CONSTRAINT uq_comprobante_serie_numero UNIQUE (tipo_comprobante, serie, numero)
);
-- Una transacción no puede tener dos comprobantes vigentes.
CREATE UNIQUE INDEX uq_comprobante_por_transaccion
    ON tab_comprobante_oficial (tipo_transaccion, transaccion_id)
    WHERE estado <> 'RECHAZADO';

-- Tab_comprobante_pendiente: salida persistida (outbox) que procesa el Job de Reintentos.
-- Estados técnicos propuestos en el Hito 3 (Fig. 5).
CREATE TABLE tab_comprobante_pendiente (
    id                  SERIAL        PRIMARY KEY,
    comprobante_id      INT           NOT NULL UNIQUE REFERENCES tab_comprobante_oficial(id),
    clave_idempotencia  VARCHAR(40)   NOT NULL UNIQUE,   -- RUC-TIPO-SERIE-NUMERO
    estado              VARCHAR(18)   NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE', 'EN_PROCESO', 'CONFIRMADO', 'RECHAZADO',
                                          'POR_CONCILIAR', 'REVISION_REQUERIDA')),
    intentos            INT           NOT NULL DEFAULT 0,
    proximo_intento     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    tomado_en           TIMESTAMPTZ,                     -- cuándo lo tomó un worker (EN_PROCESO)
    ultimo_error        VARCHAR(300),
    creado_en           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_pendiente_por_procesar ON tab_comprobante_pendiente (proximo_intento)
    WHERE estado IN ('PENDIENTE', 'POR_CONCILIAR');

-- ---------------------------------------------------------------------
-- Datos base
-- ---------------------------------------------------------------------
-- DATOS DE DEMOSTRACIÓN: reemplazar por la razón social, RUC y dirección reales
-- de Moto Repuestos Rider Soluciones E.I.R.L. (EDU-0018, ILA-0071).
INSERT INTO tab_e (razon_social, ruc, direccion_fiscal) VALUES
    ('MOTO REPUESTOS RIDER SOLUCIONES E.I.R.L.', '20000000001', 'Arequipa, Perú (dirección por registrar)');

INSERT INTO tab_serie_comprobante (tipo_comprobante, serie) VALUES
    ('BOLETA',  'B001'),
    ('FACTURA', 'F001');
