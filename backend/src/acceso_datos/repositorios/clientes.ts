import type { EntityManager } from 'typeorm';
import type { DatosClienteRecepcion, RepositorioClientes } from '../../dominio/clientes/repositorios';
import type { ClienteComprador } from '../../dominio/ventas/VentaMoto';

type Fila = Record<string, unknown>;

export class RepositorioClientesTypeORM implements RepositorioClientes {
  constructor(private readonly em: EntityManager) {}

  async obtenerOCrear(d: DatosClienteRecepcion): Promise<number> {
    if (d.documento) {
      // ON CONFLICT DO NOTHING: si dos recepciones simultáneas crean el mismo DNI, solo una lo inserta.
      const insertado: Fila[] = await this.em.query(
        `INSERT INTO tab_cliente (tipo_documento, numero_documento, nombre_razon_social, telefono)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (numero_documento) DO NOTHING
         RETURNING id`,
        [d.documento.tipo, d.documento.numero, d.nombre, d.telefono],
      );
      if (insertado[0]) return Number(insertado[0].id);
      const [existente]: Fila[] = await this.em.query(`SELECT id FROM tab_cliente WHERE numero_documento = $1`, [
        d.documento.numero,
      ]);
      return Number(existente.id);
    }

    const [existente]: Fila[] = await this.em.query(
      `SELECT id FROM tab_cliente
        WHERE numero_documento IS NULL AND LOWER(nombre_razon_social) = LOWER($1) AND telefono = $2
        ORDER BY id LIMIT 1`,
      [d.nombre, d.telefono],
    );
    if (existente) return Number(existente.id);
    const [nuevo]: Fila[] = await this.em.query(
      `INSERT INTO tab_cliente (nombre_razon_social, telefono) VALUES ($1, $2) RETURNING id`,
      [d.nombre, d.telefono],
    );
    return Number(nuevo.id);
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
    await this.em.query(`UPDATE tab_cliente SET nombre_razon_social = $2, telefono = $3 WHERE id = $1`, [
      clienteId,
      nombre,
      telefono,
    ]);
  }
}
