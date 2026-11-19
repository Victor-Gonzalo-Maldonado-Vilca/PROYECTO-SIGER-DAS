import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegistrarVentaMoto } from '../aplicacion/ventas/RegistrarVentaMoto';
import { Modulos, Rol, type UsuarioAutenticado } from '../dominio/seguridad/permisos';
import { Moto } from '../dominio/ventas/Moto';
import { crearFuenteDatos } from './fuenteDatos';
import { UnidadDeTrabajoTypeORM } from './UnidadDeTrabajoTypeORM';

/**
 * Pruebas de integración contra PostgreSQL REAL (docker compose up -d).
 * Ejecutar con:  npm run test:integracion
 * Verifican los escenarios de la Tabla 7 del Hito 3 para ILA-0012.
 */
const PREFIJO = 'IT-';
let ds: DataSource;
let usuario: UsuarioAutenticado;

const contarMotos = async () =>
  Number((await ds.query(`SELECT COUNT(*) AS n FROM tab_moto WHERE numero_motor LIKE $1`, [`${PREFIJO}%`]))[0].n);

const moto = (sufijo: string) => ({
  marca: 'Prueba',
  modelo: 'Integración',
  anio: 2026,
  color: 'Negro',
  numeroMotor: `${PREFIJO}MOT-${sufijo}`,
  numeroChasis: `${PREFIJO}CHS-${sufijo}`,
});

async function limpiar() {
  const ids = `SELECT id FROM tab_moto WHERE numero_motor LIKE '${PREFIJO}%'`;
  await ds.query(
    `DELETE FROM tab_auditoria WHERE entidad = 'Tab_venta_moto'
       AND entidad_id IN (SELECT id FROM tab_venta_moto WHERE moto_id IN (${ids}))`,
  );
  await ds.query(`DELETE FROM tab_venta_moto WHERE moto_id IN (${ids})`);
  await ds.query(`DELETE FROM tab_moto WHERE numero_motor LIKE '${PREFIJO}%'`);
}

beforeAll(async () => {
  ds = crearFuenteDatos();
  await ds.initialize();
  const [gerente] = await ds.query(`SELECT id FROM tab_usuario WHERE usuario = 'gerente'`);
  usuario = {
    id: Number(gerente.id),
    usuario: 'gerente',
    nombreCompleto: 'Gerente',
    rol: Rol.GERENTE,
    modulos: [Modulos.VENTAS],
  };
  await limpiar();
});

afterAll(async () => {
  await limpiar();
  await ds.destroy();
});

describe('ILA-0012 contra db_siger', () => {
  it('registra y devuelve el número de venta generado por la BD', async () => {
    const r = await new RegistrarVentaMoto(new UnidadDeTrabajoTypeORM(ds)).ejecutar(moto('001'), usuario);
    expect(r.nroVenta).toMatch(/^VM-\d{4}-\d{4,}$/);
    const [aud] = await ds.query(`SELECT detalle FROM tab_auditoria WHERE entidad_id = $1`, [r.ventaId]);
    expect(aud.detalle).toMatchObject({ ilacion: 'ILA-0012', nroVenta: r.nroVenta });
  });

  it('RNF-0004: un fallo después del INSERT de la moto revierte todo (sin huérfanos)', async () => {
    const antes = await contarMotos();
    const uow = new UnidadDeTrabajoTypeORM(ds);
    await expect(
      uow.ejecutar(async (repos) => {
        await repos.motos.guardar(Moto.crear(moto('ROLLBACK')));
        throw new Error('Falla simulada antes de insertar la venta');
      }),
    ).rejects.toThrow('Falla simulada');
    expect(await contarMotos()).toBe(antes);
  });

  it('dos registros simultáneos del mismo N.° de motor: solo uno se confirma, el otro recibe MSG-46', async () => {
    const casoDeUso = new RegistrarVentaMoto(new UnidadDeTrabajoTypeORM(ds));
    const antes = await contarMotos();

    const resultados = await Promise.allSettled([
      casoDeUso.ejecutar({ ...moto('CONC'), numeroChasis: `${PREFIJO}CHS-A` }, usuario),
      casoDeUso.ejecutar({ ...moto('CONC'), numeroChasis: `${PREFIJO}CHS-B` }, usuario),
    ]);

    const exitos = resultados.filter((r) => r.status === 'fulfilled');
    const fallos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(exitos).toHaveLength(1);
    expect(fallos).toHaveLength(1);
    expect(fallos[0].reason).toMatchObject({ codigo: 'MSG-46' });
    expect(await contarMotos()).toBe(antes + 1);
  });
});
