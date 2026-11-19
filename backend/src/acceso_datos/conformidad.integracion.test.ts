import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { UnidadDeTrabajo } from '../aplicacion/puertos/UnidadDeTrabajo';
import { RegistrarConformidadServicio } from '../aplicacion/ordenes/RegistrarConformidadServicio';
import { ErrorConflicto } from '../dominio/compartido/errores';
import { Modulos, Rol, type UsuarioAutenticado } from '../dominio/seguridad/permisos';
import { crearFuenteDatos } from './fuenteDatos';
import { UnidadDeTrabajoTypeORM } from './UnidadDeTrabajoTypeORM';

/**
 * ILA-0075 contra PostgreSQL REAL. Ejecutar con: npm run test:integracion
 * Cada prueba crea su propia orden (cliente, moto, orden y proforma) con el prefijo IT.
 */
const FIRMA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DOC_CLIENTE = '99999901';

let ds: DataSource;
let usuario: UsuarioAutenticado;
let contador = 0;

async function crearOrden(estado = 'EN_PROCESO', estadoProforma = 'APROBADA'): Promise<number> {
  contador += 1;
  const [{ id: clienteId }] = await ds.query(`SELECT id FROM tab_cliente WHERE numero_documento = $1`, [DOC_CLIENTE]);
  const [{ id: motoId }] = await ds.query(
    `INSERT INTO tab_moto (placa, marca, modelo, anio, color, numero_motor, numero_chasis, cliente_id)
     VALUES ($1, 'Prueba', 'IT', 2024, 'Negro', $2, $3, $4) RETURNING id`,
    [`IT-${contador}`, `IT-CS-MOT-${contador}`, `IT-CS-CHS-${contador}`, clienteId],
  );
  const [{ id: ordenId }] = await ds.query(
    `INSERT INTO tab_os (tipo_servicio, descripcion, estado, cliente_id, moto_id)
     VALUES ('REPARACION', 'Orden de prueba de integración', $1, $2, $3) RETURNING id`,
    [estado, clienteId, motoId],
  );
  const [{ id: proformaId }] = await ds.query(
    `INSERT INTO tab_p (estado, total, cliente_id, orden_id) VALUES ($1, 99.50, $2, $3) RETURNING id`,
    [estadoProforma, clienteId, ordenId],
  );
  await ds.query(
    `INSERT INTO tab_dp (proforma_id, tipo_item, descripcion, cantidad, costo_unit, subtotal)
     VALUES ($1, 'SERVICIO', 'Revisión', 1, 99.50, 99.50)`,
    [proformaId],
  );
  return Number(ordenId);
}

async function limpiar() {
  const ordenes = `SELECT os.id FROM tab_os os JOIN tab_moto m ON m.id = os.moto_id WHERE m.numero_motor LIKE 'IT-CS-%'`;
  await ds.query(`DELETE FROM tab_auditoria WHERE entidad = 'tab_CS' AND entidad_id IN (SELECT id FROM tab_cs WHERE orden_id IN (${ordenes}))`);
  await ds.query(`DELETE FROM tab_cs WHERE orden_id IN (${ordenes})`);
  await ds.query(`DELETE FROM tab_p WHERE orden_id IN (${ordenes})`);
  await ds.query(`DELETE FROM tab_os WHERE id IN (${ordenes})`);
  await ds.query(`DELETE FROM tab_moto WHERE numero_motor LIKE 'IT-CS-%'`);
}

const estadoDe = async (ordenId: number) =>
  String((await ds.query(`SELECT estado FROM tab_os WHERE id = $1`, [ordenId]))[0].estado);
const conformidadesDe = async (ordenId: number) =>
  Number((await ds.query(`SELECT COUNT(*) AS n FROM tab_cs WHERE orden_id = $1`, [ordenId]))[0].n);

beforeAll(async () => {
  ds = crearFuenteDatos();
  await ds.initialize();
  const [g] = await ds.query(`SELECT id FROM tab_usuario WHERE usuario = 'gerente'`);
  usuario = { id: Number(g.id), usuario: 'gerente', nombreCompleto: 'Gerente', rol: Rol.GERENTE, modulos: [Modulos.ORDENES_SERVICIO] };
  await ds.query(
    `INSERT INTO tab_cliente (tipo_documento, numero_documento, nombre_razon_social)
     VALUES ('DNI', $1, 'Cliente de integración') ON CONFLICT (numero_documento) DO NOTHING`,
    [DOC_CLIENTE],
  );
});

beforeEach(limpiar);

afterAll(async () => {
  await limpiar();
  await ds.query(`DELETE FROM tab_cliente WHERE numero_documento = $1`, [DOC_CLIENTE]);
  await ds.destroy();
});

describe('ILA-0075 contra db_siger', () => {
  it('inserta tab_CS, pasa la orden a FINALIZADO y registra el historial', async () => {
    const ordenId = await crearOrden();
    const r = await new RegistrarConformidadServicio(new UnidadDeTrabajoTypeORM(ds)).ejecutar(
      { ordenId, kilometraje: 15000, firma: FIRMA },
      usuario,
    );

    expect(r.nroConformidad).toMatch(/^CS-\d{4}-\d{4,}$/);
    expect(await estadoDe(ordenId)).toBe('FINALIZADO');
    const [cs] = await ds.query(`SELECT kilometraje, precio_total, length(firma_cliente) AS bytes FROM tab_cs WHERE orden_id = $1`, [ordenId]);
    expect(cs).toMatchObject({ kilometraje: 15000, precio_total: '99.50' });
    expect(Number(cs.bytes)).toBeGreaterThan(8);
    const historial = await ds.query(`SELECT estado_anterior, estado_nuevo FROM tab_trazabilidad WHERE orden_id = $1`, [ordenId]);
    expect(historial).toEqual([{ estado_anterior: 'EN_PROCESO', estado_nuevo: 'FINALIZADO' }]);
  });

  it('RNF-0004: si falla un paso tras el INSERT en tab_CS, se revierte y la orden conserva su estado', async () => {
    const ordenId = await crearOrden('POR_ENTREGAR');
    const real = new UnidadDeTrabajoTypeORM(ds);
    // Unidad de trabajo real, pero con el historial forzado a fallar (después del INSERT y del UPDATE).
    const conFalla: UnidadDeTrabajo = {
      ejecutar: (trabajo) =>
        real.ejecutar((repos) =>
          trabajo({ ...repos, historialOrden: { registrar: async () => { throw new Error('Falla simulada'); } } }),
        ),
    };

    await expect(
      new RegistrarConformidadServicio(conFalla).ejecutar({ ordenId, kilometraje: 1, firma: FIRMA }, usuario),
    ).rejects.toThrow('Falla simulada');
    expect(await conformidadesDe(ordenId)).toBe(0);
    expect(await estadoDe(ordenId)).toBe('POR_ENTREGAR');
  });

  it('dos conformidades simultáneas para la misma orden: solo una se registra', async () => {
    const ordenId = await crearOrden();
    const casoDeUso = new RegistrarConformidadServicio(new UnidadDeTrabajoTypeORM(ds));
    const resultados = await Promise.allSettled([
      casoDeUso.ejecutar({ ordenId, kilometraje: 100, firma: FIRMA }, usuario),
      casoDeUso.ejecutar({ ordenId, kilometraje: 100, firma: FIRMA }, usuario),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fallo?.reason).toMatchObject({ codigo: 'MSG-05' });
    expect(await conformidadesDe(ordenId)).toBe(1);
  });

  it('rechaza una orden con proforma pendiente y no la modifica', async () => {
    const ordenId = await crearOrden('EN_PROCESO', 'PENDIENTE');
    await expect(
      new RegistrarConformidadServicio(new UnidadDeTrabajoTypeORM(ds)).ejecutar({ ordenId, kilometraje: 1, firma: FIRMA }, usuario),
    ).rejects.toMatchObject({ codigo: 'MSG-05' });
    expect(await estadoDe(ordenId)).toBe('EN_PROCESO');
  });

  it('una orden ya conformada responde conflicto', async () => {
    const ordenId = await crearOrden();
    const casoDeUso = new RegistrarConformidadServicio(new UnidadDeTrabajoTypeORM(ds));
    await casoDeUso.ejecutar({ ordenId, kilometraje: 1, firma: FIRMA }, usuario);
    await ds.query(`UPDATE tab_os SET estado = 'EN_PROCESO' WHERE id = $1`, [ordenId]);
    await expect(casoDeUso.ejecutar({ ordenId, kilometraje: 1, firma: FIRMA }, usuario)).rejects.toBeInstanceOf(ErrorConflicto);
  });
});
