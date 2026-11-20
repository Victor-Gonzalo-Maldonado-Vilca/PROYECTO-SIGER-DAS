import type { DataSource, EntityManager } from 'typeorm';
import type { Cliente, DatosCliente, EstadoCliente } from '../../dominio/clientes/Cliente';
import type {
  ConsultaClientes,
  DatosClienteRecepcion,
  FilaCliente,
  HistorialCliente,
  RepositorioClientes,
} from '../../dominio/clientes/repositorios';
import { formatearNumero } from '../../dominio/comprobantes/Comprobante';
import type { ClienteComprador } from '../../dominio/ventas/VentaMoto';

type Fila = Record<string, unknown>;

const COLUMNAS = `id, tipo_documento, numero_documento, nombre_razon_social, telefono, correo, direccion,
                  estado, version, fecha_registro`;

const aCliente = (f: Fila): FilaCliente => ({
  id: Number(f.id),
  tipoDocumento: (f.tipo_documento as 'DNI' | 'RUC' | null) ?? null,
  numeroDocumento: (f.numero_documento as string | null) ?? null,
  nombre: String(f.nombre_razon_social),
  telefono: (f.telefono as string | null) ?? null,
  correo: (f.correo as string | null) ?? null,
  direccion: (f.direccion as string | null) ?? null,
  estado: f.estado as EstadoCliente,
  version: Number(f.version),
  fechaRegistro: new Date(f.fecha_registro as string).toISOString(),
});

const fecha = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

export class RepositorioClientesTypeORM implements RepositorioClientes {
  constructor(private readonly em: EntityManager) {}

  async obtenerOCrear(d: DatosClienteRecepcion): Promise<{ id: number; estado: EstadoCliente }> {
    const resultado = (f: Fila) => ({ id: Number(f.id), estado: f.estado as EstadoCliente });
    if (d.documento) {
      // ON CONFLICT DO NOTHING: si dos recepciones simultáneas crean el mismo DNI, solo una lo inserta.
      const insertado: Fila[] = await this.em.query(
        `INSERT INTO tab_cliente (tipo_documento, numero_documento, nombre_razon_social, telefono)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (numero_documento) DO NOTHING
         RETURNING id, estado`,
        [d.documento.tipo, d.documento.numero, d.nombre, d.telefono],
      );
      if (insertado[0]) return resultado(insertado[0]);
      const [existente]: Fila[] = await this.em.query(
        `SELECT id, estado FROM tab_cliente WHERE numero_documento = $1 FOR SHARE`,
        [d.documento.numero],
      );
      return resultado(existente);
    }

    const [existente]: Fila[] = await this.em.query(
      `SELECT id, estado FROM tab_cliente
        WHERE numero_documento IS NULL AND LOWER(nombre_razon_social) = LOWER($1) AND telefono = $2
        ORDER BY id LIMIT 1 FOR SHARE`,
      [d.nombre, d.telefono],
    );
    if (existente) return resultado(existente);
    const [nuevo]: Fila[] = await this.em.query(
      `INSERT INTO tab_cliente (nombre_razon_social, telefono) VALUES ($1, $2) RETURNING id, estado`,
      [d.nombre, d.telefono],
    );
    return resultado(nuevo);
  }

  async obtenerComprador(clienteId: number): Promise<ClienteComprador | null> {
    // FOR SHARE: el cliente no puede borrarse ni modificarse hasta el COMMIT de la asociación.
    const [f]: Fila[] = await this.em.query(
      `SELECT id, nombre_razon_social, tipo_documento, numero_documento, estado
         FROM tab_cliente WHERE id = $1 FOR SHARE`,
      [clienteId],
    );
    if (!f) return null;
    return {
      id: Number(f.id),
      nombre: String(f.nombre_razon_social),
      tipoDocumento: (f.tipo_documento as 'DNI' | 'RUC' | null) ?? null,
      numeroDocumento: (f.numero_documento as string | null) ?? null,
      estado: f.estado as 'ACTIVO' | 'INACTIVO',
    };
  }

  async actualizarContacto(clienteId: number, nombre: string, telefono: string): Promise<void> {
    await this.em.query(
      `UPDATE tab_cliente SET nombre_razon_social = $2, telefono = $3, version = version + 1 WHERE id = $1`,
      [clienteId, nombre, telefono],
    );
  }

  async existeDocumento(numero: string, excluirClienteId?: number): Promise<boolean> {
    const filas: Fila[] = await this.em.query(
      `SELECT 1 FROM tab_cliente WHERE numero_documento = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [numero, excluirClienteId ?? null],
    );
    return filas.length > 0;
  }

  async registrar(d: DatosCliente): Promise<number> {
    const [f]: Fila[] = await this.em.query(
      `INSERT INTO tab_cliente (tipo_documento, numero_documento, nombre_razon_social, telefono, correo, direccion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO')
       RETURNING id`,
      [d.tipoDocumento, d.numeroDocumento, d.nombre, d.telefono, d.correo, d.direccion],
    );
    return Number(f.id);
  }

  async bloquear(clienteId: number): Promise<Cliente | null> {
    const [f]: Fila[] = await this.em.query(`SELECT ${COLUMNAS} FROM tab_cliente WHERE id = $1 FOR UPDATE`, [
      clienteId,
    ]);
    return f ? aCliente(f) : null;
  }

  async actualizar(clienteId: number, d: DatosCliente): Promise<number> {
    // Con UPDATE ... RETURNING, el driver de PostgreSQL devuelve [filas, cantidad].
    const [[f]]: [Fila[], number] = await this.em.query(
      `UPDATE tab_cliente
          SET tipo_documento = $2, numero_documento = $3, nombre_razon_social = $4,
              telefono = $5, correo = $6, direccion = $7, version = version + 1
        WHERE id = $1
    RETURNING version`,
      [clienteId, d.tipoDocumento, d.numeroDocumento, d.nombre, d.telefono, d.correo, d.direccion],
    );
    return Number(f.version);
  }

  async operacionesPendientes(clienteId: number): Promise<string[]> {
    const [f]: Fila[] = await this.em.query(
      `SELECT
         (SELECT COUNT(*) FROM tab_os
           WHERE cliente_id = $1
             AND estado IN ('RECEPCIONADO', 'EN_PROCESO', 'POR_ENTREGAR', 'FINALIZADO')) AS ordenes,
         (SELECT COUNT(*) FROM tab_venta_moto
           WHERE cliente_id = $1 AND estado = 'CON_CLIENTE')                       AS ventas,
         (SELECT COUNT(*) FROM tab_comprobante_oficial
           WHERE cliente_id = $1 AND estado = 'GENERADO')                          AS comprobantes`,
      [clienteId],
    );
    const pendientes: string[] = [];
    const n = (v: unknown) => Number(v);
    if (n(f.ordenes) > 0) pendientes.push(`${n(f.ordenes)} orden(es) de servicio sin entregar`);
    if (n(f.ventas) > 0) pendientes.push(`${n(f.ventas)} venta(s) de moto sin comprobante`);
    if (n(f.comprobantes) > 0) pendientes.push(`${n(f.comprobantes)} comprobante(s) pendiente(s) de SUNAT`);
    return pendientes;
  }

  async cambiarEstado(clienteId: number, estado: EstadoCliente): Promise<number> {
    const [[f]]: [Fila[], number] = await this.em.query(
      `UPDATE tab_cliente SET estado = $2, version = version + 1 WHERE id = $1 RETURNING version`,
      [clienteId, estado],
    );
    return Number(f.version);
  }
}

/** Consultas de solo lectura del padrón (CU-CLI-02) y del historial (CU-CLI-05). */
export class ConsultaClientesTypeORM implements ConsultaClientes {
  constructor(private readonly ds: DataSource) {}

  async listar(filtro: { texto?: string; estado?: EstadoCliente }): Promise<FilaCliente[]> {
    const filas: Fila[] = await this.ds.query(
      `SELECT ${COLUMNAS}
         FROM tab_cliente
        WHERE ($2::text IS NULL OR estado = $2)
          AND ($1::text IS NULL
               OR numero_documento LIKE $1 || '%'
               OR nombre_razon_social ILIKE '%' || $1 || '%'
               OR telefono LIKE '%' || $1 || '%')
     ORDER BY nombre_razon_social
        LIMIT 200`,
      [filtro.texto ?? null, filtro.estado ?? null],
    );
    return filas.map(aCliente);
  }

  async detalle(clienteId: number): Promise<FilaCliente | null> {
    const [f]: Fila[] = await this.ds.query(`SELECT ${COLUMNAS} FROM tab_cliente WHERE id = $1`, [clienteId]);
    return f ? aCliente(f) : null;
  }

  async historial(clienteId: number): Promise<HistorialCliente | null> {
    const cliente = await this.detalle(clienteId);
    if (!cliente) return null;

    // Paso 3: consultas en paralelo (una por pestaña).
    const [vehiculos, ordenes, proformas, comprobantes]: Fila[][] = await Promise.all([
      // Motos compradas en la tienda (Tab_venta_moto) y motos atendidas en el taller
      // (propietario en Tab_moto o cliente de una orden). Una moto comprada aparece una sola vez.
      this.ds.query(
        `SELECT DISTINCT ON (m.id)
                m.id, m.placa, m.marca, m.modelo, m.anio, m.color,
                CASE WHEN v.id IS NOT NULL THEN 'COMPRA' ELSE 'TALLER' END AS origen,
                v.nro_venta, v.fecha AS fecha_venta
           FROM tab_moto m
      LEFT JOIN tab_venta_moto v ON v.moto_id = m.id AND v.cliente_id = $1
          WHERE v.id IS NOT NULL
             OR m.cliente_id = $1
             OR EXISTS (SELECT 1 FROM tab_os o WHERE o.moto_id = m.id AND o.cliente_id = $1)
       ORDER BY m.id, v.fecha DESC NULLS LAST`,
        [clienteId],
      ),
      this.ds.query(
        `SELECT o.id, o.nro_orden, o.fecha_recepcion, o.tipo_servicio, o.descripcion, o.estado, m.placa
           FROM tab_os o JOIN tab_moto m ON m.id = o.moto_id
          WHERE o.cliente_id = $1
       ORDER BY o.fecha_recepcion DESC`,
        [clienteId],
      ),
      this.ds.query(
        `SELECT p.id, p.fecha, p.estado, p.total, o.nro_orden
           FROM tab_p p LEFT JOIN tab_os o ON o.id = p.orden_id
          WHERE p.cliente_id = $1
       ORDER BY p.fecha DESC`,
        [clienteId],
      ),
      this.ds.query(
        `SELECT c.id, c.tipo_comprobante, c.serie, c.numero, c.fecha_emision, c.monto_total, c.estado,
                c.tipo_transaccion, COALESCE(v.nro_venta, o.nro_orden, c.transaccion_id::text) AS transaccion
           FROM tab_comprobante_oficial c
      LEFT JOIN tab_venta_moto v ON c.tipo_transaccion = 'VENTA_MOTO'     AND v.id = c.transaccion_id
      LEFT JOIN tab_os o         ON c.tipo_transaccion = 'ORDEN_SERVICIO' AND o.id = c.transaccion_id
          WHERE c.cliente_id = $1
       ORDER BY c.fecha_emision DESC`,
        [clienteId],
      ),
    ]);

    return {
      cliente,
      vehiculos: vehiculos
        .map((f) => ({
          motoId: Number(f.id),
          placa: (f.placa as string | null) ?? null,
          marca: (f.marca as string | null) ?? null,
          modelo: (f.modelo as string | null) ?? null,
          anio: f.anio == null ? null : Number(f.anio),
          color: (f.color as string | null) ?? null,
          origen: f.origen as 'COMPRA' | 'TALLER',
          nroVenta: (f.nro_venta as string | null) ?? null,
          fechaVenta: fecha(f.fecha_venta),
        }))
        .sort((a, b) => (b.fechaVenta ?? '').localeCompare(a.fechaVenta ?? '')),
      ordenes: ordenes.map((f) => ({
        id: Number(f.id),
        nroOrden: String(f.nro_orden),
        fechaRecepcion: fecha(f.fecha_recepcion)!,
        tipoServicio: String(f.tipo_servicio),
        descripcion: String(f.descripcion),
        estado: String(f.estado),
        placa: (f.placa as string | null) ?? null,
      })),
      proformas: proformas.map((f) => ({
        id: Number(f.id),
        fecha: fecha(f.fecha)!,
        estado: String(f.estado),
        total: Number(f.total),
        nroOrden: (f.nro_orden as string | null) ?? null,
      })),
      comprobantes: comprobantes.map((f) => ({
        id: Number(f.id),
        numero: formatearNumero(String(f.serie), Number(f.numero)),
        tipo: String(f.tipo_comprobante),
        fechaEmision: fecha(f.fecha_emision)!,
        montoTotal: Number(f.monto_total),
        estado: String(f.estado),
        transaccion: `${f.tipo_transaccion === 'VENTA_MOTO' ? 'Venta de moto' : f.tipo_transaccion === 'ORDEN_SERVICIO' ? 'Orden de servicio' : 'Venta de repuesto'} ${f.transaccion}`,
      })),
    };
  }
}
