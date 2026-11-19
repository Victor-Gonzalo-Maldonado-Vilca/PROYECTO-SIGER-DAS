import type { DataSource, EntityManager } from 'typeorm';
import {
  EstadoComprobante,
  EstadoPendiente,
  formatearNumero,
  type TipoComprobante,
} from '../../dominio/comprobantes/Comprobante';
import type {
  ConsultaComprobantes,
  DatosEmisor,
  DocumentoComprobante,
  FilaComprobante,
  FilaTransaccionPendiente,
  NuevoComprobante,
  PendienteTomado,
  RepositorioComprobantes,
  RepositorioPendientes,
  RepositorioTransaccionesFacturables,
} from '../../dominio/comprobantes/repositorios';
import {
  TipoTransaccion,
  type ItemFacturable,
  type TransaccionFacturable,
} from '../../dominio/comprobantes/TransaccionFacturable';
import { traducirErrorBD } from '../erroresBD';

type Fila = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/** Comprobante vigente (no rechazado) de una transacción. */
const EXISTE_COMPROBANTE = (tipo: string, columnaId: string) =>
  `EXISTS (SELECT 1 FROM tab_comprobante_oficial co
            WHERE co.tipo_transaccion = '${tipo}' AND co.transaccion_id = ${columnaId}
              AND co.estado <> 'RECHAZADO')`;

const cliente = (f: Fila): TransaccionFacturable['cliente'] =>
  f.cliente_id == null
    ? null
    : {
        id: num(f.cliente_id),
        tipoDocumento: (f.tipo_documento as 'DNI' | 'RUC' | null) ?? null,
        numeroDocumento: (f.numero_documento as string | null) ?? null,
        nombre: String(f.nombre_razon_social),
      };

// =====================================================================
// TransaccionFacturable: VentaMoto y OrdenServicio
// =====================================================================
export class RepositorioTransaccionesFacturablesTypeORM implements RepositorioTransaccionesFacturables {
  constructor(private readonly em: EntityManager) {}

  async bloquear(tipo: TipoTransaccion, id: number): Promise<TransaccionFacturable | null> {
    if (!Number.isInteger(id) || id <= 0) return null;
    if (tipo === TipoTransaccion.VENTA_MOTO) return this.ventaMoto(id);
    if (tipo === TipoTransaccion.ORDEN_SERVICIO) return this.ordenServicio(id);
    return null; // VENTA_REPUESTO: aún no implementada
  }

  private async ventaMoto(id: number): Promise<TransaccionFacturable | null> {
    const [f]: Fila[] = await this.em.query(
      `SELECT v.id, v.nro_venta, v.fecha, v.estado, v.precio,
              c.id AS cliente_id, c.tipo_documento, c.numero_documento, c.nombre_razon_social,
              m.marca, m.modelo, m.anio, m.numero_motor, m.numero_chasis,
              ${EXISTE_COMPROBANTE('VENTA_MOTO', 'v.id')} AS tiene_comprobante
         FROM tab_venta_moto v
         JOIN tab_moto m         ON m.id = v.moto_id
    LEFT JOIN tab_cliente c      ON c.id = v.cliente_id
        WHERE v.id = $1
          FOR UPDATE OF v`,
      [id],
    );
    if (!f) return null;
    const total = num(f.precio);
    return {
      tipo: TipoTransaccion.VENTA_MOTO,
      id: num(f.id),
      referencia: String(f.nro_venta),
      fecha: f.fecha as Date,
      cliente: cliente(f),
      items: [
        {
          descripcion: `Motocicleta ${f.marca} ${f.modelo} ${f.anio} - Motor ${f.numero_motor} - Chasis ${f.numero_chasis}`,
          cantidad: 1,
          importe: total,
        },
      ],
      total,
      listaParaComprobante: f.estado === 'CON_CLIENTE' && f.precio != null,
      tieneComprobante: Boolean(f.tiene_comprobante),
    };
  }

  private async ordenServicio(id: number): Promise<TransaccionFacturable | null> {
    const [f]: Fila[] = await this.em.query(
      `SELECT os.id, os.nro_orden, os.fecha_recepcion, os.estado,
              c.id AS cliente_id, c.tipo_documento, c.numero_documento, c.nombre_razon_social,
              p.id AS proforma_id, p.estado AS estado_proforma, p.total,
              EXISTS (SELECT 1 FROM tab_cs cs WHERE cs.orden_id = os.id) AS tiene_conformidad,
              ${EXISTE_COMPROBANTE('ORDEN_SERVICIO', 'os.id')} AS tiene_comprobante
         FROM tab_os os
         JOIN tab_cliente c ON c.id = os.cliente_id
    LEFT JOIN LATERAL (SELECT * FROM tab_p WHERE orden_id = os.id ORDER BY fecha DESC LIMIT 1) p ON TRUE
        WHERE os.id = $1
          FOR UPDATE OF os`,
      [id],
    );
    if (!f) return null;
    const items: Fila[] = f.proforma_id
      ? await this.em.query(`SELECT descripcion, cantidad, subtotal FROM tab_dp WHERE proforma_id = $1 ORDER BY id`, [
          f.proforma_id,
        ])
      : [];
    return {
      tipo: TipoTransaccion.ORDEN_SERVICIO,
      id: num(f.id),
      referencia: String(f.nro_orden),
      fecha: f.fecha_recepcion as Date,
      cliente: cliente(f),
      items: items.map((i) => ({ descripcion: String(i.descripcion), cantidad: num(i.cantidad), importe: num(i.subtotal) })),
      total: num(f.total),
      // EDU-0019: la conformidad es condición para liquidar la orden.
      listaParaComprobante: f.estado === 'FINALIZADO' && f.estado_proforma === 'APROBADA' && Boolean(f.tiene_conformidad),
      tieneComprobante: Boolean(f.tiene_comprobante),
    };
  }

  async marcarComprobanteEmitido(tipo: TipoTransaccion, id: number, usuarioId: number): Promise<void> {
    if (tipo === TipoTransaccion.VENTA_MOTO) {
      await this.em.query(
        `UPDATE tab_venta_moto SET estado = 'COMPROBANTE_EMITIDO', version = version + 1 WHERE id = $1`,
        [id],
      );
    } else if (tipo === TipoTransaccion.ORDEN_SERVICIO) {
      const [anterior]: Fila[] = await this.em.query(`SELECT estado FROM tab_os WHERE id = $1 FOR UPDATE`, [id]);
      await this.em.query(`UPDATE tab_os SET estado = 'ENTREGADO', version = version + 1 WHERE id = $1`, [id]);
      await this.em.query(
        `INSERT INTO tab_trazabilidad (orden_id, estado_anterior, estado_nuevo, usuario_id) VALUES ($1, $2, 'ENTREGADO', $3)`,
        [id, anterior?.estado ?? 'FINALIZADO', usuarioId],
      );
    }
  }
}

// =====================================================================
// Comprobantes
// =====================================================================
export class RepositorioComprobantesTypeORM implements RepositorioComprobantes {
  constructor(private readonly em: EntityManager) {}

  async emisor(): Promise<DatosEmisor> {
    const [f]: Fila[] = await this.em.query(`SELECT id, ruc, razon_social, direccion_fiscal FROM tab_e ORDER BY id LIMIT 1`);
    if (!f) throw new Error('No hay datos fiscales del emisor (tab_e). Registre los datos de la empresa (ILA-0071).');
    return { id: num(f.id), ruc: String(f.ruc), razonSocial: String(f.razon_social), direccionFiscal: String(f.direccion_fiscal) };
  }

  async siguienteNumero(tipo: TipoComprobante, serie: string): Promise<number> {
    // UPDATE bloquea la fila de la serie hasta el COMMIT: dos emisiones simultáneas
    // obtienen números consecutivos y, si una hace ROLLBACK, su número se reutiliza.
    const [[f]]: [Fila[], number] = await this.em.query(
      `UPDATE tab_serie_comprobante SET ultimo_numero = ultimo_numero + 1
        WHERE tipo_comprobante = $1 AND serie = $2
    RETURNING ultimo_numero`,
      [tipo, serie],
    );
    if (!f) throw new Error(`No existe la serie ${serie} para ${tipo}.`);
    return num(f.ultimo_numero);
  }

  async guardar(c: NuevoComprobante): Promise<{ id: number; fechaEmision: Date }> {
    try {
      const [f]: Fila[] = await this.em.query(
        `INSERT INTO tab_comprobante_oficial
            (tipo_comprobante, serie, numero, subtotal, igv, monto_total, emisor_id, cliente_id,
             tipo_transaccion, transaccion_id, detalle, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, fecha_emision`,
        [
          c.tipo,
          c.serie,
          c.numero,
          c.subtotal,
          c.igv,
          c.total,
          c.emisorId,
          c.clienteId,
          c.tipoTransaccion,
          c.transaccionId,
          JSON.stringify(c.detalle),
          c.usuarioId,
        ],
      );
      return { id: num(f.id), fechaEmision: f.fecha_emision as Date };
    } catch (error) {
      throw traducirErrorBD(error);
    }
  }

  async registrarRespuesta(id: number, estado: EstadoComprobante, codigo: string, descripcion: string): Promise<void> {
    // { estado EMITIDO inmutable }: solo se actualiza un comprobante GENERADO.
    await this.em.query(
      `UPDATE tab_comprobante_oficial
          SET estado = $2, codigo_respuesta_sunat = $3, descripcion_respuesta = $4
        WHERE id = $1 AND estado = '${EstadoComprobante.GENERADO}'`,
      [id, estado, codigo.slice(0, 10), descripcion.slice(0, 300)],
    );
  }
}

// =====================================================================
// Tab_comprobante_pendiente (outbox del Job de Reintentos)
// =====================================================================
export class RepositorioPendientesTypeORM implements RepositorioPendientes {
  constructor(private readonly em: EntityManager) {}

  async crear(comprobanteId: number, clave: string): Promise<number> {
    const [f]: Fila[] = await this.em.query(
      `INSERT INTO tab_comprobante_pendiente (comprobante_id, clave_idempotencia) VALUES ($1, $2) RETURNING id`,
      [comprobanteId, clave],
    );
    return num(f.id);
  }

  async tomarSiguiente(comprobanteId?: number): Promise<PendienteTomado | null> {
    // FOR UPDATE SKIP LOCKED: si otra instancia del job ya bloqueó la fila, la salta.
    const [filas]: [Fila[], number] = await this.em.query(
      `WITH candidato AS (
          SELECT id, estado
            FROM tab_comprobante_pendiente
           WHERE estado IN ('${EstadoPendiente.PENDIENTE}', '${EstadoPendiente.POR_CONCILIAR}')
             AND (($1::int IS NULL AND proximo_intento <= NOW()) OR comprobante_id = $1::int)
        ORDER BY proximo_intento, id
           LIMIT 1
             FOR UPDATE SKIP LOCKED
       )
       UPDATE tab_comprobante_pendiente p
          SET estado = '${EstadoPendiente.EN_PROCESO}', intentos = p.intentos + 1,
              tomado_en = NOW(), actualizado_en = NOW()
         FROM candidato
        WHERE p.id = candidato.id
    RETURNING p.id, p.comprobante_id, p.clave_idempotencia, p.intentos, candidato.estado AS estado_anterior`,
      [comprobanteId ?? null],
    );
    const p = filas[0];
    if (!p) return null;

    const [f]: Fila[] = await this.em.query(
      `SELECT co.tipo_comprobante, co.serie, co.numero, co.fecha_emision, co.subtotal, co.igv, co.monto_total,
              co.detalle, co.tipo_transaccion, co.transaccion_id, co.usuario_id,
              e.ruc, e.razon_social,
              c.tipo_documento, c.numero_documento, c.nombre_razon_social
         FROM tab_comprobante_oficial co
         JOIN tab_e e       ON e.id = co.emisor_id
         JOIN tab_cliente c ON c.id = co.cliente_id
        WHERE co.id = $1`,
      [p.comprobante_id],
    );
    return {
      id: num(p.id),
      comprobanteId: num(p.comprobante_id),
      clave: String(p.clave_idempotencia),
      intentos: num(p.intentos),
      requiereConsulta: p.estado_anterior === EstadoPendiente.POR_CONCILIAR,
      tipoTransaccion: f.tipo_transaccion as TipoTransaccion,
      transaccionId: num(f.transaccion_id),
      usuarioId: num(f.usuario_id),
      envio: {
        clave: String(p.clave_idempotencia),
        tipo: f.tipo_comprobante as 'BOLETA' | 'FACTURA',
        serie: String(f.serie),
        numero: num(f.numero),
        fechaEmision: f.fecha_emision as Date,
        emisor: { ruc: String(f.ruc), razonSocial: String(f.razon_social) },
        adquiriente: {
          tipoDocumento: String(f.tipo_documento),
          numeroDocumento: String(f.numero_documento),
          nombre: String(f.nombre_razon_social),
        },
        items: f.detalle as ItemFacturable[],
        subtotal: num(f.subtotal),
        igv: num(f.igv),
        total: num(f.monto_total),
      },
    };
  }

  async actualizar(
    id: number,
    cambios: { estado: EstadoPendiente; ultimoError?: string | null; reintentarEnSegundos?: number },
  ): Promise<void> {
    await this.em.query(
      `UPDATE tab_comprobante_pendiente
          SET estado = $2,
              ultimo_error = $3,
              proximo_intento = NOW() + make_interval(secs => $4),
              tomado_en = NULL,
              actualizado_en = NOW()
        WHERE id = $1`,
      [id, cambios.estado, cambios.ultimoError ?? null, cambios.reintentarEnSegundos ?? 0],
    );
  }

  async recuperarAbandonados(minutos: number): Promise<number> {
    const [, cantidad]: [unknown, number] = await this.em.query(
      `UPDATE tab_comprobante_pendiente
          SET estado = '${EstadoPendiente.POR_CONCILIAR}', tomado_en = NULL, actualizado_en = NOW(),
              ultimo_error = 'Trabajo abandonado durante el envío: se consultará a SUNAT antes de reenviar'
        WHERE estado = '${EstadoPendiente.EN_PROCESO}' AND tomado_en < NOW() - make_interval(mins => $1)`,
      [minutos],
    );
    return cantidad;
  }
}

// =====================================================================
// Consultas de solo lectura (INT-018)
// =====================================================================
export class ConsultaComprobantesTypeORM implements ConsultaComprobantes {
  constructor(private readonly ds: DataSource) {}

  async transaccionesPendientesBoleta(texto?: string): Promise<FilaTransaccionPendiente[]> {
    // Solo clientes persona natural (DNI) y transacciones listas y sin comprobante vigente.
    const filas: Fila[] = await this.ds.query(
      `SELECT * FROM (
          SELECT 'VENTA_MOTO' AS tipo, v.id, v.nro_venta AS referencia, c.nombre_razon_social AS cliente,
                 c.numero_documento AS documento, v.precio AS total, v.fecha
            FROM tab_venta_moto v
            JOIN tab_cliente c ON c.id = v.cliente_id
           WHERE v.estado = 'CON_CLIENTE' AND v.precio IS NOT NULL AND c.tipo_documento = 'DNI'
             AND NOT ${EXISTE_COMPROBANTE('VENTA_MOTO', 'v.id')}
          UNION ALL
          SELECT 'ORDEN_SERVICIO', os.id, os.nro_orden, c.nombre_razon_social, c.numero_documento, p.total, os.fecha_recepcion
            FROM tab_os os
            JOIN tab_cliente c ON c.id = os.cliente_id
            JOIN LATERAL (SELECT * FROM tab_p WHERE orden_id = os.id ORDER BY fecha DESC LIMIT 1) p ON TRUE
           WHERE os.estado = 'FINALIZADO' AND p.estado = 'APROBADA' AND c.tipo_documento = 'DNI'
             AND EXISTS (SELECT 1 FROM tab_cs cs WHERE cs.orden_id = os.id)
             AND NOT ${EXISTE_COMPROBANTE('ORDEN_SERVICIO', 'os.id')}
       ) t
       WHERE $1::text IS NULL
          OR t.referencia ILIKE '%' || $1 || '%'
          OR t.cliente    ILIKE '%' || $1 || '%'
          OR t.documento  ILIKE '%' || $1 || '%'
       ORDER BY t.fecha`,
      [texto ?? null],
    );
    return filas.map((f) => ({
      tipo: f.tipo as TipoTransaccion,
      id: num(f.id),
      referencia: String(f.referencia),
      cliente: String(f.cliente),
      documento: String(f.documento),
      total: num(f.total),
      fecha: f.fecha as Date,
    }));
  }

  async proximoNumero(tipo: TipoComprobante, serie: string): Promise<number> {
    const [f]: Fila[] = await this.ds.query(
      `SELECT ultimo_numero + 1 AS proximo FROM tab_serie_comprobante WHERE tipo_comprobante = $1 AND serie = $2`,
      [tipo, serie],
    );
    return num(f?.proximo ?? 1);
  }

  async listar(): Promise<FilaComprobante[]> {
    const filas: Fila[] = await this.ds.query(
      `SELECT co.id, co.tipo_comprobante, co.serie, co.numero, co.fecha_emision, co.monto_total, co.estado,
              co.codigo_respuesta_sunat, c.nombre_razon_social AS cliente,
              p.estado AS estado_envio, p.intentos, p.ultimo_error,
              COALESCE(v.nro_venta, os.nro_orden) AS referencia
         FROM tab_comprobante_oficial co
         JOIN tab_cliente c ON c.id = co.cliente_id
    LEFT JOIN tab_comprobante_pendiente p ON p.comprobante_id = co.id
    LEFT JOIN tab_venta_moto v ON co.tipo_transaccion = 'VENTA_MOTO'     AND v.id  = co.transaccion_id
    LEFT JOIN tab_os os        ON co.tipo_transaccion = 'ORDEN_SERVICIO' AND os.id = co.transaccion_id
     ORDER BY co.id DESC
        LIMIT 200`,
    );
    return filas.map((f) => ({
      id: num(f.id),
      tipo: f.tipo_comprobante as TipoComprobante,
      numeroCompleto: formatearNumero(String(f.serie), num(f.numero)),
      fechaEmision: f.fecha_emision as Date,
      cliente: String(f.cliente),
      total: num(f.monto_total),
      estado: f.estado as EstadoComprobante,
      estadoEnvio: (f.estado_envio as EstadoPendiente | null) ?? null,
      intentos: num(f.intentos),
      ultimoError: (f.ultimo_error as string | null) ?? null,
      referenciaTransaccion: String(f.referencia ?? '—'),
      codigoRespuesta: (f.codigo_respuesta_sunat as string | null) ?? null,
    }));
  }

  async documento(id: number): Promise<DocumentoComprobante | null> {
    const [f]: Fila[] = await this.ds.query(
      `SELECT co.*, e.id AS e_id, e.ruc, e.razon_social, e.direccion_fiscal,
              c.tipo_documento, c.numero_documento, c.nombre_razon_social
         FROM tab_comprobante_oficial co
         JOIN tab_e e       ON e.id = co.emisor_id
         JOIN tab_cliente c ON c.id = co.cliente_id
        WHERE co.id = $1`,
      [id],
    );
    if (!f) return null;
    return {
      id: num(f.id),
      tipo: f.tipo_comprobante as TipoComprobante,
      numeroCompleto: formatearNumero(String(f.serie), num(f.numero)),
      fechaEmision: f.fecha_emision as Date,
      estado: f.estado as EstadoComprobante,
      emisor: {
        id: num(f.e_id),
        ruc: String(f.ruc),
        razonSocial: String(f.razon_social),
        direccionFiscal: String(f.direccion_fiscal),
      },
      cliente: {
        tipoDocumento: String(f.tipo_documento),
        numeroDocumento: String(f.numero_documento),
        nombre: String(f.nombre_razon_social),
      },
      items: f.detalle as ItemFacturable[],
      subtotal: num(f.subtotal),
      igv: num(f.igv),
      total: num(f.monto_total),
      codigoRespuesta: (f.codigo_respuesta_sunat as string | null) ?? null,
      descripcionRespuesta: (f.descripcion_respuesta as string | null) ?? null,
    };
  }
}
