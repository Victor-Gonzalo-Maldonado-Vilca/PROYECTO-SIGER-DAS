import type { DataSource, EntityManager } from 'typeorm';
import type { EstadoOrden, OrdenParaConformidad } from '../../dominio/ordenes/OrdenServicio';
import type {
  ConsultaConformidades,
  ConsultaOrdenes,
  FilaConformidad,
  FilaOrden,
  ItemServicio,
  NuevaConformidad,
  OrdenApta,
  RepositorioConformidades,
  RepositorioHistorialOrden,
  RepositorioOrdenesServicio,
  ResumenOrden,
} from '../../dominio/ordenes/repositorios';
import { traducirErrorBD } from '../erroresBD';

/*
 * MOD-02: estos repositorios usan consultas SQL parametrizadas a través del
 * EntityManager de TypeORM (misma transacción), porque necesitan JOIN, bloqueo
 * FOR UPDATE y RETURNING que se leen mejor en SQL que con el query builder.
 */

type Fila = Record<string, unknown>;

const aItem = (f: Fila): ItemServicio => ({
  tipoItem: f.tipo_item as ItemServicio['tipoItem'],
  descripcion: String(f.descripcion),
  cantidad: Number(f.cantidad),
  subtotal: Number(f.subtotal),
});

const SQL_ITEMS = `SELECT tipo_item, descripcion, cantidad, subtotal
                     FROM tab_dp WHERE proforma_id = $1
                 ORDER BY tipo_item DESC, id`;

export class RepositorioOrdenesServicioTypeORM implements RepositorioOrdenesServicio {
  constructor(private readonly em: EntityManager) {}

  async bloquearParaConformidad(ordenId: number): Promise<OrdenParaConformidad | null> {
    // FOR UPDATE OF os: bloquea solo la fila de la orden hasta el COMMIT/ROLLBACK.
    const [f]: Fila[] = await this.em.query(
      `SELECT os.id, os.nro_orden, os.estado,
              p.id AS proforma_id, p.estado AS estado_proforma, p.total AS total_proforma,
              EXISTS (SELECT 1 FROM tab_cs cs WHERE cs.orden_id = os.id) AS tiene_conformidad
         FROM tab_os os
    LEFT JOIN LATERAL (SELECT * FROM tab_p WHERE orden_id = os.id ORDER BY fecha DESC LIMIT 1) p ON TRUE
        WHERE os.id = $1
          FOR UPDATE OF os`,
      [ordenId],
    );
    if (!f) return null;
    return {
      id: Number(f.id),
      nroOrden: String(f.nro_orden),
      estado: f.estado as EstadoOrden,
      proformaId: f.proforma_id == null ? null : Number(f.proforma_id),
      estadoProforma: (f.estado_proforma as string | null) ?? null,
      totalProforma: f.total_proforma == null ? null : Number(f.total_proforma),
      tieneConformidad: Boolean(f.tiene_conformidad),
    };
  }

  async itemsDeProforma(proformaId: number): Promise<ItemServicio[]> {
    const filas: Fila[] = await this.em.query(SQL_ITEMS, [proformaId]);
    return filas.map(aItem);
  }

  async cambiarEstado(ordenId: number, nuevo: EstadoOrden): Promise<void> {
    await this.em.query(`UPDATE tab_os SET estado = $2, version = version + 1 WHERE id = $1`, [ordenId, nuevo]);
  }

  async ordenActivaDeMoto(motoId: number): Promise<string | null> {
    const [f]: Fila[] = await this.em.query(
      `SELECT nro_orden FROM tab_os WHERE moto_id = $1 AND estado IN ('RECEPCIONADO', 'EN_PROCESO') LIMIT 1`,
      [motoId],
    );
    return f ? String(f.nro_orden) : null;
  }

  async registrar(o: { clienteId: number; motoId: number; tipoServicio: string; descripcion: string }) {
    try {
      // nro_orden lo genera la BD con siguiente_nro_orden() (correlativo anual sin huecos).
      const [f]: Fila[] = await this.em.query(
        `INSERT INTO tab_os (tipo_servicio, descripcion, estado, cliente_id, moto_id)
         VALUES ($1, $2, 'RECEPCIONADO', $3, $4)
         RETURNING id, nro_orden, fecha_recepcion`,
        [o.tipoServicio, o.descripcion, o.clienteId, o.motoId],
      );
      return { id: Number(f.id), nroOrden: String(f.nro_orden), fechaRecepcion: f.fecha_recepcion as Date };
    } catch (error) {
      throw traducirErrorBD(error);
    }
  }
}

/** Consulta básica de órdenes (CU-TAL-02) y N.° referencial. */
export class ConsultaOrdenesTypeORM implements ConsultaOrdenes {
  constructor(private readonly ds: DataSource) {}

  async listar(filtro?: { texto?: string }): Promise<FilaOrden[]> {
    const filas: Fila[] = await this.ds.query(
      `SELECT os.id, os.nro_orden, os.fecha_recepcion, os.estado, os.tipo_servicio, os.descripcion,
              c.nombre_razon_social AS cliente, c.telefono, m.placa, m.modelo
         FROM tab_os os
         JOIN tab_cliente c ON c.id = os.cliente_id
         JOIN tab_moto m    ON m.id = os.moto_id
        WHERE $1::text IS NULL
           OR os.nro_orden           ILIKE '%' || $1 || '%'
           OR m.placa                ILIKE '%' || $1 || '%'
           OR c.nombre_razon_social  ILIKE '%' || $1 || '%'
     ORDER BY os.fecha_recepcion DESC
        LIMIT 200`,
      [filtro?.texto ?? null],
    );
    return filas.map((f) => ({
      id: Number(f.id),
      nroOrden: String(f.nro_orden),
      fechaRecepcion: f.fecha_recepcion as Date,
      estado: f.estado as EstadoOrden,
      tipoServicio: String(f.tipo_servicio),
      descripcion: String(f.descripcion),
      cliente: String(f.cliente),
      telefono: (f.telefono as string | null) ?? null,
      placa: (f.placa as string | null) ?? null,
      modelo: (f.modelo as string | null) ?? null,
    }));
  }

  async proximoNumero(): Promise<string> {
    const [f]: Fila[] = await this.ds.query(
      `SELECT EXTRACT(YEAR FROM NOW())::INT AS anio,
              COALESCE((SELECT ultimo_numero FROM tab_correlativo_anual
                         WHERE entidad = 'ORDEN_SERVICIO' AND anio = EXTRACT(YEAR FROM NOW())::INT), 0) + 1 AS n`,
    );
    const n = String(f.n);
    return `ORD-${f.anio}-${n.padStart(4, '0')}`;
  }
}

export class RepositorioHistorialOrdenTypeORM implements RepositorioHistorialOrden {
  constructor(private readonly em: EntityManager) {}

  async registrar(e: { ordenId: number; anterior: EstadoOrden; nuevo: EstadoOrden; usuarioId: number }) {
    await this.em.query(
      `INSERT INTO tab_trazabilidad (orden_id, estado_anterior, estado_nuevo, usuario_id) VALUES ($1, $2, $3, $4)`,
      [e.ordenId, e.anterior, e.nuevo, e.usuarioId],
    );
  }
}

export class RepositorioConformidadesTypeORM implements RepositorioConformidades {
  constructor(private readonly em: EntityManager) {}

  async guardar(c: NuevaConformidad) {
    try {
      const [f]: Fila[] = await this.em.query(
        `INSERT INTO tab_cs (orden_id, proforma_id, kilometraje, trabajos_realizados, insumos_empleados,
                             precio_total, firma_cliente, usuario_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, nro_conformidad, fecha_emision`,
        [
          c.ordenId,
          c.proformaId,
          c.kilometraje,
          c.trabajosRealizados,
          c.insumosEmpleados,
          c.precioTotal,
          c.firmaPng,
          c.usuarioId,
        ],
      );
      return { id: Number(f.id), nroConformidad: String(f.nro_conformidad), fechaEmision: f.fecha_emision as Date };
    } catch (error) {
      throw traducirErrorBD(error);
    }
  }
}

/** Consultas de solo lectura de INT-075. */
export class ConsultaConformidadesTypeORM implements ConsultaConformidades {
  constructor(private readonly ds: DataSource) {}

  async ordenesAptas(): Promise<OrdenApta[]> {
    const filas: Fila[] = await this.ds.query(
      `SELECT os.id, os.nro_orden, os.estado, m.placa, c.nombre_razon_social AS cliente
         FROM tab_os os
         JOIN tab_moto m    ON m.id = os.moto_id
         JOIN tab_cliente c ON c.id = os.cliente_id
        WHERE os.estado IN ('EN_PROCESO', 'POR_ENTREGAR')
          AND EXISTS (SELECT 1 FROM tab_p p WHERE p.orden_id = os.id AND p.estado = 'APROBADA')
          AND NOT EXISTS (SELECT 1 FROM tab_cs cs WHERE cs.orden_id = os.id)
     ORDER BY os.fecha_recepcion`,
    );
    return filas.map((f) => ({
      id: Number(f.id),
      nroOrden: String(f.nro_orden),
      estado: f.estado as EstadoOrden,
      placa: (f.placa as string | null) ?? null,
      cliente: String(f.cliente),
    }));
  }

  async resumenOrden(ordenId: number): Promise<ResumenOrden | null> {
    // "Consulta atómica" (paso 5): ambas lecturas en una transacción REPEATABLE READ
    // para que vean la misma fotografía de los datos.
    return this.ds.transaction('REPEATABLE READ', async (em) => {
      const [f]: Fila[] = await em.query(
        `SELECT os.id, os.nro_orden, os.estado, os.tipo_servicio, os.descripcion,
                c.tipo_documento, c.numero_documento, c.nombre_razon_social, c.telefono,
                m.placa, m.marca, m.modelo, m.anio, m.color,
                p.id AS proforma_id, p.total
           FROM tab_os os
           JOIN tab_cliente c ON c.id = os.cliente_id
           JOIN tab_moto m    ON m.id = os.moto_id
      LEFT JOIN LATERAL (SELECT * FROM tab_p WHERE orden_id = os.id ORDER BY fecha DESC LIMIT 1) p ON TRUE
          WHERE os.id = $1`,
        [ordenId],
      );
      if (!f) return null;
      const items: Fila[] = f.proforma_id ? await em.query(SQL_ITEMS, [f.proforma_id]) : [];
      return {
        orden: {
          id: Number(f.id),
          nroOrden: String(f.nro_orden),
          estado: f.estado as EstadoOrden,
          tipoServicio: String(f.tipo_servicio),
          descripcion: String(f.descripcion),
        },
        cliente: {
          tipoDocumento: (f.tipo_documento as string | null) ?? 'Sin documento',
          numeroDocumento: (f.numero_documento as string | null) ?? '',
          nombre: String(f.nombre_razon_social),
          telefono: (f.telefono as string | null) ?? null,
        },
        vehiculo: {
          placa: (f.placa as string | null) ?? null,
          marca: String(f.marca),
          modelo: String(f.modelo),
          anio: Number(f.anio),
          color: String(f.color),
        },
        servicios: items.map(aItem),
        precioTotal: Number(f.total ?? 0),
      };
    });
  }

  async listar(): Promise<FilaConformidad[]> {
    const filas: Fila[] = await this.ds.query(
      `SELECT cs.id, cs.nro_conformidad, cs.fecha_emision, os.nro_orden, m.placa,
              c.nombre_razon_social AS cliente, cs.kilometraje, cs.precio_total
         FROM tab_cs cs
         JOIN tab_os os     ON os.id = cs.orden_id
         JOIN tab_moto m    ON m.id = os.moto_id
         JOIN tab_cliente c ON c.id = os.cliente_id
     ORDER BY cs.fecha_emision DESC
        LIMIT 200`,
    );
    return filas.map((f) => ({
      id: Number(f.id),
      nroConformidad: String(f.nro_conformidad),
      fechaEmision: f.fecha_emision as Date,
      nroOrden: String(f.nro_orden),
      placa: (f.placa as string | null) ?? null,
      cliente: String(f.cliente),
      kilometraje: Number(f.kilometraje),
      precioTotal: Number(f.precio_total),
    }));
  }

  async firma(conformidadId: number): Promise<Buffer | null> {
    const [f]: Fila[] = await this.ds.query(`SELECT firma_cliente FROM tab_cs WHERE id = $1`, [conformidadId]);
    return (f?.firma_cliente as Buffer | undefined) ?? null;
  }
}
