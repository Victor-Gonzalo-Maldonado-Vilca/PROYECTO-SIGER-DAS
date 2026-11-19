import type { DataSource, EntityManager } from 'typeorm';
import type { Moto } from '../../dominio/ventas/Moto';
import type { EstadoVenta, VentaMoto } from '../../dominio/ventas/VentaMoto';
import type {
  ConsultaVentasMoto,
  FilaClienteBusqueda,
  FilaVentaMoto,
  RepositorioMotos,
  RepositorioVentasMoto,
  VentaMotoRegistrada,
  VentaParaAsociar,
} from '../../dominio/ventas/repositorios';
import { traducirErrorBD } from '../erroresBD';
import { MotoEsquema, VentaMotoEsquema } from '../esquemas';

/** Repositorio de Tab_moto. Recibe el EntityManager de la transacción en curso. */
export class RepositorioMotosTypeORM implements RepositorioMotos {
  constructor(private readonly em: EntityManager) {}

  existeNumeroMotor(numeroMotor: string): Promise<boolean> {
    return this.em.getRepository(MotoEsquema).exists({ where: { numeroMotor } });
  }

  existeNumeroChasis(numeroChasis: string): Promise<boolean> {
    return this.em.getRepository(MotoEsquema).exists({ where: { numeroChasis } });
  }

  async guardar(moto: Moto): Promise<number> {
    try {
      const resultado = await this.em.getRepository(MotoEsquema).insert({
        placa: moto.datos.placa ?? null,
        marca: moto.datos.marca,
        modelo: moto.datos.modelo,
        anio: moto.datos.anio,
        color: moto.datos.color,
        numeroMotor: moto.datos.numeroMotor,
        numeroChasis: moto.datos.numeroChasis,
      });
      return Number(resultado.identifiers[0].id);
    } catch (error) {
      throw traducirErrorBD(error);
    }
  }

  async bloquearPorPlaca(placa: string): Promise<{ id: number; clienteId: number | null } | null> {
    const [f]: Array<Record<string, unknown>> = await this.em.query(
      `SELECT id, cliente_id FROM tab_moto WHERE placa = $1 FOR UPDATE`,
      [placa],
    );
    return f ? { id: Number(f.id), clienteId: f.cliente_id == null ? null : Number(f.cliente_id) } : null;
  }

  async actualizarDescripcion(motoId: number, color: string | null, modelo: string | null): Promise<void> {
    await this.em.query(`UPDATE tab_moto SET color = $2, modelo = $3 WHERE id = $1`, [motoId, color, modelo]);
  }

  async registrarRecibida(datos: { placa: string; color: string | null; modelo: string | null; clienteId: number }) {
    try {
      const [f]: Array<Record<string, unknown>> = await this.em.query(
        `INSERT INTO tab_moto (placa, color, modelo, cliente_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [datos.placa, datos.color, datos.modelo, datos.clienteId],
      );
      return Number(f.id);
    } catch (error) {
      throw traducirErrorBD(error);
    }
  }
}

/** Repositorio de Tab_venta_moto. */
export class RepositorioVentasMotoTypeORM implements RepositorioVentasMoto {
  constructor(private readonly em: EntityManager) {}

  async guardar(venta: VentaMoto, motoId: number): Promise<VentaMotoRegistrada> {
    try {
      const resultado = await this.em
        .createQueryBuilder()
        .insert()
        .into(VentaMotoEsquema)
        .values({ motoId, usuarioId: venta.registradaPor, estado: venta.estado, precio: venta.precio.toFixed(2) })
        // Nombres de PROPIEDAD del EntitySchema; TypeORM los traduce a columnas.
        // En result.raw llegan con el nombre de la columna (nro_venta).
        .returning(['id', 'nroVenta', 'fecha'])
        .execute();
      const fila = resultado.raw[0] as { id: number; nro_venta: string; fecha: Date };
      return { id: Number(fila.id), nroVenta: fila.nro_venta, fecha: fila.fecha };
    } catch (error) {
      throw traducirErrorBD(error);
    }
  }

  async bloquear(ventaId: number): Promise<VentaParaAsociar | null> {
    const [f]: Array<Record<string, unknown>> = await this.em.query(
      `SELECT id, nro_venta, estado, version FROM tab_venta_moto WHERE id = $1 FOR UPDATE`,
      [ventaId],
    );
    if (!f) return null;
    return { id: Number(f.id), nroVenta: String(f.nro_venta), estado: f.estado as EstadoVenta, version: Number(f.version) };
  }

  async asociarCliente(ventaId: number, clienteId: number): Promise<number> {
    const [[f]]: [Array<Record<string, unknown>>, number] = await this.em.query(
      `UPDATE tab_venta_moto SET cliente_id = $2, estado = 'CON_CLIENTE', version = version + 1
        WHERE id = $1
    RETURNING version`,
      [ventaId, clienteId],
    );
    return Number(f.version);
  }
}

/** Consultas de solo lectura: TBL-18 (ventas) y TBL-12 (clientes). Consultas parametrizadas. */
export class ConsultaVentasMotoTypeORM implements ConsultaVentasMoto {
  constructor(private readonly ds: DataSource) {}

  async buscarClientes(texto: string): Promise<FilaClienteBusqueda[]> {
    const filas: Array<Record<string, unknown>> = await this.ds.query(
      `SELECT id, tipo_documento, numero_documento, nombre_razon_social, telefono, estado
         FROM tab_cliente
        WHERE numero_documento LIKE $1 || '%'
           OR nombre_razon_social ILIKE '%' || $1 || '%'
     ORDER BY (numero_documento = $1) DESC NULLS LAST, nombre_razon_social
        LIMIT 50`,
      [texto],
    );
    return filas.map((f) => ({
      id: Number(f.id),
      tipoDocumento: (f.tipo_documento as 'DNI' | 'RUC' | null) ?? null,
      numeroDocumento: (f.numero_documento as string | null) ?? null,
      nombre: String(f.nombre_razon_social),
      telefono: (f.telefono as string | null) ?? null,
      estado: f.estado as 'ACTIVO' | 'INACTIVO',
    }));
  }

  async listar(filtro?: { texto?: string; soloSinCliente?: boolean }): Promise<FilaVentaMoto[]> {
    const filas: Array<Record<string, unknown>> = await this.ds.query(
      `SELECT v.id, v.nro_venta, v.fecha, v.estado, v.version, v.precio,
              m.marca, m.modelo, m.anio, m.color, m.numero_motor, m.numero_chasis,
              c.nombre_razon_social AS cliente
         FROM tab_venta_moto v
         JOIN tab_moto m      ON m.id = v.moto_id
    LEFT JOIN tab_cliente c   ON c.id = v.cliente_id
        WHERE (NOT $2::boolean OR v.cliente_id IS NULL)
          AND ($1::text IS NULL
           OR v.nro_venta     ILIKE '%' || $1 || '%'
           OR m.marca         ILIKE '%' || $1 || '%'
           OR m.modelo        ILIKE '%' || $1 || '%'
           OR m.numero_motor  ILIKE '%' || $1 || '%'
           OR m.numero_chasis ILIKE '%' || $1 || '%'
           OR c.nombre_razon_social ILIKE '%' || $1 || '%')
     ORDER BY v.fecha DESC
        LIMIT 200`,
      [filtro?.texto ?? null, filtro?.soloSinCliente ?? false],
    );

    return filas.map((f) => ({
      id: Number(f.id),
      nroVenta: String(f.nro_venta),
      fecha: f.fecha as Date,
      estado: f.estado as EstadoVenta,
      marca: String(f.marca),
      modelo: String(f.modelo),
      anio: Number(f.anio),
      color: String(f.color),
      numeroMotor: String(f.numero_motor),
      numeroChasis: String(f.numero_chasis),
      cliente: (f.cliente as string | null) ?? null,
      version: Number(f.version),
      precio: f.precio == null ? null : Number(f.precio),
    }));
  }
}
