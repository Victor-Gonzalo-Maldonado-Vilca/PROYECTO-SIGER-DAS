import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AsociarClienteVentaMoto } from '../aplicacion/ventas/AsociarClienteVentaMoto';
import { RegistrarVentaMoto } from '../aplicacion/ventas/RegistrarVentaMoto';
import { ConsultaVentasMotoTypeORM } from './repositorios/ventas';
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
  await ds.query(
    `DELETE FROM tab_auditoria WHERE accion = 'ASOCIAR_CLIENTE_VENTA_MOTO'
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

describe('ILA-0017 / CU-VEN-10 Asociar cliente a venta de moto', () => {
  let clienteDni: number;
  let clienteSinDocumento: number;
  let contador = 0;

  const nuevaVenta = async () => {
    contador += 1;
    const r = await new RegistrarVentaMoto(new UnidadDeTrabajoTypeORM(ds)).ejecutar(moto(`AS-${contador}`), usuario);
    return r.ventaId;
  };
  const versionDe = async (id: number) =>
    Number((await ds.query(`SELECT version FROM tab_venta_moto WHERE id = $1`, [id]))[0].version);
  const asociar = (ventaId: number, clienteId: number, version: number) =>
    new AsociarClienteVentaMoto(new UnidadDeTrabajoTypeORM(ds)).ejecutar(ventaId, { clienteId, version }, usuario);

  beforeAll(async () => {
    [{ id: clienteDni }] = await ds.query(
      `INSERT INTO tab_cliente (tipo_documento, numero_documento, nombre_razon_social) VALUES ('DNI', '99999904', 'Comprador IT')
       ON CONFLICT (numero_documento) DO UPDATE SET nombre_razon_social = EXCLUDED.nombre_razon_social RETURNING id`,
    );
    [{ id: clienteSinDocumento }] = await ds.query(
      `INSERT INTO tab_cliente (nombre_razon_social, telefono) VALUES ('Cliente IT sin documento', '900000004') RETURNING id`,
    );
  });

  afterAll(async () => {
    await limpiar();
    await ds.query(`DELETE FROM tab_cliente WHERE id IN ($1, $2)`, [clienteDni, clienteSinDocumento]);
  });

  it('asocia el cliente, pasa la venta a CON_CLIENTE y responde MSG-58', async () => {
    const ventaId = await nuevaVenta();
    const r = await asociar(ventaId, clienteDni, await versionDe(ventaId));

    expect(r).toMatchObject({ codigo: 'MSG-58', estado: 'CON_CLIENTE', cliente: 'Comprador IT' });
    const [v] = await ds.query(`SELECT estado, cliente_id FROM tab_venta_moto WHERE id = $1`, [ventaId]);
    expect(v).toEqual({ estado: 'CON_CLIENTE', cliente_id: clienteDni });
    const [aud] = await ds.query(
      `SELECT detalle FROM tab_auditoria WHERE accion = 'ASOCIAR_CLIENTE_VENTA_MOTO' AND entidad_id = $1`,
      [ventaId],
    );
    expect(aud.detalle).toMatchObject({ ilacion: 'ILA-0017', clienteId: clienteDni });
  });

  it('rechaza un cliente sin DNI ni RUC (RN-VEN-15) y la venta sigue SIN_CLIENTE', async () => {
    const ventaId = await nuevaVenta();
    await expect(asociar(ventaId, clienteSinDocumento, await versionDe(ventaId))).rejects.toMatchObject({
      codigo: 'CLIENTE-NO-FISCAL',
    });
    const [v] = await ds.query(`SELECT estado, cliente_id FROM tab_venta_moto WHERE id = $1`, [ventaId]);
    expect(v).toEqual({ estado: 'SIN_CLIENTE', cliente_id: null });
  });

  it('una venta que ya tiene cliente no se vuelve a asociar', async () => {
    const ventaId = await nuevaVenta();
    const r = await asociar(ventaId, clienteDni, await versionDe(ventaId));
    await expect(asociar(ventaId, clienteDni, r.version)).rejects.toMatchObject({ codigo: 'VENTA-CON-CLIENTE' });
  });

  it('dos vendedores asocian clientes a la misma venta a la vez: solo uno gana', async () => {
    const ventaId = await nuevaVenta();
    const version = await versionDe(ventaId);
    const res = await Promise.allSettled([asociar(ventaId, clienteDni, version), asociar(ventaId, clienteDni, version)]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await versionDe(ventaId)).toBe(version + 1);
  });

  it('la búsqueda encuentra al cliente por DNI y por nombre; el listado filtra las ventas sin cliente', async () => {
    const consulta = new ConsultaVentasMotoTypeORM(ds);
    expect((await consulta.buscarClientes('99999904')).map((c) => c.id)).toContain(clienteDni);
    expect((await consulta.buscarClientes('comprador it')).map((c) => c.id)).toContain(clienteDni);

    const ventaId = await nuevaVenta();
    const pendientes = await consulta.listar({ soloSinCliente: true });
    expect(pendientes.map((v) => v.id)).toContain(ventaId);
    expect(pendientes.every((v) => v.cliente === null)).toBe(true);
  });
});
