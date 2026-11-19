import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ActualizarOrdenServicio } from '../aplicacion/ordenes/ActualizarOrdenServicio';
import { RegistrarOrdenServicio } from '../aplicacion/ordenes/RegistrarOrdenServicio';
import type { UnidadDeTrabajo } from '../aplicacion/puertos/UnidadDeTrabajo';
import { Modulos, Rol, type UsuarioAutenticado } from '../dominio/seguridad/permisos';
import { crearFuenteDatos } from './fuenteDatos';
import { UnidadDeTrabajoTypeORM } from './UnidadDeTrabajoTypeORM';

/**
 * ILA-0001 / CU-TAL-01 contra PostgreSQL REAL. Ejecutar con: npm run test:integracion
 * (detén antes el backend de desarrollo).
 */
let ds: DataSource;
let usuario: UsuarioAutenticado;
let casoDeUso: RegistrarOrdenServicio;

const TELEFONO = '900000001';
const orden = (placa: string, extra: Record<string, unknown> = {}) => ({
  nombresCliente: 'Cliente IT Recepción',
  telefono: TELEFONO,
  placa,
  modelo: 'IT-150',
  tipoServicio: 'REPARACION',
  descripcion: 'Prueba de integración',
  ...extra,
});

const PLACAS = `SELECT id FROM tab_moto WHERE placa LIKE 'IT%-RX'`;
async function limpiar() {
  const ordenes = `SELECT id FROM tab_os WHERE moto_id IN (${PLACAS})`;
  await ds.query(`DELETE FROM tab_auditoria WHERE entidad = 'Tab_orden_servicio' AND entidad_id IN (${ordenes})`);
  await ds.query(`DELETE FROM tab_trazabilidad WHERE orden_id IN (${ordenes})`);
  await ds.query(`DELETE FROM tab_os WHERE id IN (${ordenes})`);
  await ds.query(`DELETE FROM tab_moto WHERE id IN (${PLACAS})`);
  await ds.query(`DELETE FROM tab_cliente WHERE telefono = $1 OR numero_documento = '99999903'`, [TELEFONO]);
  // Devuelve el correlativo al último N.° realmente usado (sin huecos en la BD de desarrollo).
  await ds.query(
    `UPDATE tab_correlativo_anual SET ultimo_numero = COALESCE(
       (SELECT MAX(SPLIT_PART(nro_orden, '-', 3)::INT) FROM tab_os
         WHERE nro_orden LIKE 'ORD-' || anio || '-%'), 0)
      WHERE entidad = 'ORDEN_SERVICIO'`,
  );
}

const contar = async (sql: string, p: unknown[] = []) => Number((await ds.query(sql, p))[0].n);

beforeAll(async () => {
  ds = crearFuenteDatos();
  await ds.initialize();
  const [g] = await ds.query(`SELECT id FROM tab_usuario WHERE usuario = 'gerente'`);
  usuario = { id: Number(g.id), usuario: 'gerente', nombreCompleto: 'Gerente', rol: Rol.GERENTE, modulos: [Modulos.ORDENES_SERVICIO] };
});

beforeEach(async () => {
  await limpiar();
  casoDeUso = new RegistrarOrdenServicio(new UnidadDeTrabajoTypeORM(ds));
});

afterAll(async () => {
  await limpiar();
  await ds.destroy();
});

describe('ILA-0001 contra db_siger', () => {
  it('registra cliente, moto, orden RECEPCIONADO y la trazabilidad inicial', async () => {
    const r = await casoDeUso.ejecutar(orden('IT01-RX'), usuario);

    expect(r).toMatchObject({ codigo: 'LBL-01', estado: 'RECEPCIONADO' });
    expect(r.nroOrden).toMatch(new RegExp(`^ORD-${new Date().getFullYear()}-\\d{4,}$`));
    const [os] = await ds.query(
      `SELECT os.estado, m.placa, m.modelo, c.nombre_razon_social, c.telefono, c.numero_documento
         FROM tab_os os JOIN tab_moto m ON m.id = os.moto_id JOIN tab_cliente c ON c.id = os.cliente_id
        WHERE os.id = $1`,
      [r.ordenId],
    );
    expect(os).toMatchObject({ estado: 'RECEPCIONADO', placa: 'IT01-RX', modelo: 'IT-150', telefono: TELEFONO, numero_documento: null });
    const traza = await ds.query(`SELECT estado_anterior, estado_nuevo FROM tab_trazabilidad WHERE orden_id = $1`, [r.ordenId]);
    expect(traza).toEqual([{ estado_anterior: null, estado_nuevo: 'RECEPCIONADO' }]);
  });

  it('MSG-30 si la placa ya tiene una orden activa (RN-TAL-02)', async () => {
    await casoDeUso.ejecutar(orden('IT02-RX'), usuario);
    await expect(casoDeUso.ejecutar(orden('it02-rx'), usuario)).rejects.toMatchObject({ codigo: 'MSG-30', campo: 'placa' });
  });

  it('permite una nueva orden cuando la anterior ya no está activa, reutilizando moto y cliente', async () => {
    const primera = await casoDeUso.ejecutar(orden('IT03-RX'), usuario);
    await ds.query(`UPDATE tab_os SET estado = 'FINALIZADO' WHERE id = $1`, [primera.ordenId]);
    const segunda = await casoDeUso.ejecutar(orden('IT03-RX'), usuario);

    expect(segunda.ordenId).not.toBe(primera.ordenId);
    expect(await contar(`SELECT COUNT(*) AS n FROM tab_moto WHERE placa = 'IT03-RX'`)).toBe(1);
    expect(await contar(`SELECT COUNT(*) AS n FROM tab_cliente WHERE telefono = $1`, [TELEFONO])).toBe(1);
  });

  it('con documento reconoce al cliente existente por su DNI', async () => {
    await casoDeUso.ejecutar(orden('IT04-RX', { documento: '99999903' }), usuario);
    await casoDeUso.ejecutar(orden('IT05-RX', { documento: '99999903', nombresCliente: 'Otro nombre' }), usuario);
    expect(await contar(`SELECT COUNT(*) AS n FROM tab_cliente WHERE numero_documento = '99999903'`)).toBe(1);
  });

  it('dos recepciones simultáneas de la misma placa nueva: solo una orden', async () => {
    const res = await Promise.allSettled([casoDeUso.ejecutar(orden('IT06-RX'), usuario), casoDeUso.ejecutar(orden('IT06-RX'), usuario)]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(res.find((x): x is PromiseRejectedResult => x.status === 'rejected')?.reason).toMatchObject({ codigo: 'MSG-30' });
    expect(await contar(`SELECT COUNT(*) AS n FROM tab_os os JOIN tab_moto m ON m.id = os.moto_id WHERE m.placa = 'IT06-RX'`)).toBe(1);
  });

  it('órdenes simultáneas de motos distintas reciben números consecutivos sin huecos', async () => {
    const res = await Promise.all([casoDeUso.ejecutar(orden('IT07-RX'), usuario), casoDeUso.ejecutar(orden('IT08-RX'), usuario)]);
    const numeros = res.map((r) => Number(r.nroOrden.split('-')[2])).sort((a, b) => a - b);
    expect(numeros[1] - numeros[0]).toBe(1);
  });

  describe('CU-TAL-03 Actualizar avance y estado', () => {
    const editar = (ordenId: number, version: number, cambios: Record<string, unknown> = {}) =>
      new ActualizarOrdenServicio(new UnidadDeTrabajoTypeORM(ds)).ejecutar(
        ordenId,
        {
          nombresCliente: 'Cliente IT Editado',
          telefono: TELEFONO,
          color: 'Verde',
          modelo: 'IT-200',
          tipoServicio: 'MANTENIMIENTO',
          descripcion: 'Descripción actualizada',
          estado: 'EN_PROCESO',
          version,
          ...cambios,
        },
        usuario,
      );
    const versionDe = async (id: number) => Number((await ds.query(`SELECT version FROM tab_os WHERE id = $1`, [id]))[0].version);

    it('actualiza orden, cliente y moto, cambia el estado y deja la trazabilidad', async () => {
      const { ordenId } = await casoDeUso.ejecutar(orden('IT10-RX'), usuario);
      const r = await editar(ordenId, await versionDe(ordenId));

      expect(r).toMatchObject({ codigo: 'LBL-01', estado: 'EN_PROCESO' });
      const [f] = await ds.query(
        `SELECT os.estado, os.tipo_servicio, os.descripcion, c.nombre_razon_social, m.color, m.modelo
           FROM tab_os os JOIN tab_cliente c ON c.id = os.cliente_id JOIN tab_moto m ON m.id = os.moto_id WHERE os.id = $1`,
        [ordenId],
      );
      expect(f).toMatchObject({
        estado: 'EN_PROCESO',
        tipo_servicio: 'MANTENIMIENTO',
        descripcion: 'Descripción actualizada',
        nombre_razon_social: 'Cliente IT Editado',
        color: 'Verde',
        modelo: 'IT-200',
      });
      const traza = await ds.query(
        `SELECT estado_anterior, estado_nuevo FROM tab_trazabilidad WHERE orden_id = $1 ORDER BY id`,
        [ordenId],
      );
      expect(traza).toEqual([
        { estado_anterior: null, estado_nuevo: 'RECEPCIONADO' },
        { estado_anterior: 'RECEPCIONADO', estado_nuevo: 'EN_PROCESO' },
      ]);
    });

    it('transición no permitida (RECEPCIONADO -> FINALIZADO) no modifica nada', async () => {
      const { ordenId } = await casoDeUso.ejecutar(orden('IT11-RX'), usuario);
      await expect(editar(ordenId, await versionDe(ordenId), { estado: 'FINALIZADO' })).rejects.toMatchObject({
        codigo: 'TRANSICION-NO-PERMITIDA',
      });
      const [f] = await ds.query(`SELECT estado, descripcion FROM tab_os WHERE id = $1`, [ordenId]);
      expect(f).toMatchObject({ estado: 'RECEPCIONADO', descripcion: 'Prueba de integración' });
    });

    it('una orden ENTREGADO no se puede editar (RN-TAL-06)', async () => {
      const { ordenId } = await casoDeUso.ejecutar(orden('IT12-RX'), usuario);
      await ds.query(`UPDATE tab_os SET estado = 'ENTREGADO' WHERE id = $1`, [ordenId]);
      await expect(editar(ordenId, await versionDe(ordenId))).rejects.toMatchObject({ codigo: 'ORDEN-NO-EDITABLE' });
    });

    it('bloqueo optimista: con una versión vieja se rechaza y no se pisan los cambios del otro usuario', async () => {
      const { ordenId } = await casoDeUso.ejecutar(orden('IT13-RX'), usuario);
      const vista = await versionDe(ordenId);
      await editar(ordenId, vista, { descripcion: 'Cambio del usuario A' });
      await expect(editar(ordenId, vista, { descripcion: 'Cambio del usuario B' })).rejects.toMatchObject({
        codigo: 'ORDEN-MODIFICADA',
      });
      const [f] = await ds.query(`SELECT descripcion FROM tab_os WHERE id = $1`, [ordenId]);
      expect(f.descripcion).toBe('Cambio del usuario A');
    });

    it('dos ediciones simultáneas con la misma versión: solo una se guarda', async () => {
      const { ordenId } = await casoDeUso.ejecutar(orden('IT14-RX'), usuario);
      const vista = await versionDe(ordenId);
      const res = await Promise.allSettled([
        editar(ordenId, vista, { descripcion: 'A' }),
        editar(ordenId, vista, { descripcion: 'B' }),
      ]);
      expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(await versionDe(ordenId)).toBe(vista + 1);
    });
  });

  it('RNF-0004: si falla la trazabilidad, no queda orden, moto ni cliente, y no se consume el N.°', async () => {
    const real = new UnidadDeTrabajoTypeORM(ds);
    const conFalla: UnidadDeTrabajo = {
      ejecutar: (t) => real.ejecutar((repos) => t({ ...repos, historialOrden: { registrar: async () => { throw new Error('Falla simulada'); } } })),
    };
    const [{ ultimo_numero: antes }] = await ds.query(
      `SELECT ultimo_numero FROM tab_correlativo_anual WHERE entidad = 'ORDEN_SERVICIO' AND anio = EXTRACT(YEAR FROM NOW())`,
    );

    await expect(new RegistrarOrdenServicio(conFalla).ejecutar(orden('IT09-RX'), usuario)).rejects.toThrow('Falla simulada');
    expect(await contar(`SELECT COUNT(*) AS n FROM tab_moto WHERE placa = 'IT09-RX'`)).toBe(0);
    expect(await contar(`SELECT COUNT(*) AS n FROM tab_cliente WHERE telefono = $1`, [TELEFONO])).toBe(0);
    const [{ ultimo_numero: despues }] = await ds.query(
      `SELECT ultimo_numero FROM tab_correlativo_anual WHERE entidad = 'ORDEN_SERVICIO' AND anio = EXTRACT(YEAR FROM NOW())`,
    );
    expect(despues).toBe(antes);
  });
});
