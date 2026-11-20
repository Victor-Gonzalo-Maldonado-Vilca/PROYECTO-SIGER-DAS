import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ActualizarCliente } from '../aplicacion/clientes/ActualizarCliente';
import { ConsultarClientes } from '../aplicacion/clientes/ConsultarClientes';
import { InhabilitarCliente } from '../aplicacion/clientes/InhabilitarCliente';
import { RegistrarCliente } from '../aplicacion/clientes/RegistrarCliente';
import { RegistrarOrdenServicio } from '../aplicacion/ordenes/RegistrarOrdenServicio';
import { Modulos, Rol, type UsuarioAutenticado } from '../dominio/seguridad/permisos';
import { crearFuenteDatos } from './fuenteDatos';
import { ConsultaClientesTypeORM } from './repositorios/clientes';
import { UnidadDeTrabajoTypeORM } from './UnidadDeTrabajoTypeORM';

/**
 * MOD-05 Clientes contra PostgreSQL REAL (npm run test:integracion).
 * Los clientes de prueba usan DNI que empiezan con 990 y placas IT-CLI.
 */
let ds: DataSource;
let gerente: UsuarioAutenticado;
let uow: UnidadDeTrabajoTypeORM;

const dni = (n: number) => `990${String(n).padStart(5, '0')}`;
const cliente = (n: number) => ({ tipoDocumento: 'DNI', numeroDocumento: dni(n), nombre: `Cliente IT ${n}` });

async function limpiar() {
  const ids = `SELECT id FROM tab_cliente WHERE numero_documento LIKE '990%'`;
  await ds.query(`DELETE FROM tab_auditoria WHERE entidad = 'Tab_cliente' AND entidad_id IN (${ids})`);
  const ordenes = `SELECT id FROM tab_os WHERE cliente_id IN (${ids})`;
  await ds.query(`DELETE FROM tab_auditoria WHERE entidad = 'Tab_orden_servicio' AND entidad_id IN (${ordenes})`);
  await ds.query(`DELETE FROM tab_os WHERE cliente_id IN (${ids})`);
  await ds.query(`DELETE FROM tab_moto WHERE placa LIKE 'ITC%'`);
  await ds.query(`DELETE FROM tab_cliente WHERE numero_documento LIKE '990%'`);
}

beforeAll(async () => {
  ds = crearFuenteDatos();
  await ds.initialize();
  const [g] = await ds.query(`SELECT id FROM tab_usuario WHERE usuario = 'gerente'`);
  gerente = {
    id: Number(g.id),
    usuario: 'gerente',
    nombreCompleto: 'Gerente',
    rol: Rol.GERENTE,
    modulos: [Modulos.CLIENTES, Modulos.ORDENES_SERVICIO],
  };
  uow = new UnidadDeTrabajoTypeORM(ds);
});

beforeEach(limpiar);

afterAll(async () => {
  await limpiar();
  await ds.destroy();
});

describe('MOD-05 Clientes (integración)', () => {
  it('CU-CLI-01: dos registros simultáneos del mismo DNI -> uno se guarda y el otro recibe MSG-102', async () => {
    const registrar = new RegistrarCliente(uow);
    const resultados = await Promise.allSettled([
      registrar.ejecutar(cliente(1), gerente),
      registrar.ejecutar({ ...cliente(1), nombre: 'Duplicado' }, gerente),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toMatchObject({ codigo: 'MSG-102' });
    const [n] = await ds.query(`SELECT COUNT(*) AS n FROM tab_cliente WHERE numero_documento = $1`, [dni(1)]);
    expect(Number(n.n)).toBe(1);
  });

  it('CU-CLI-02 y CU-CLI-03: busca, actualiza y sube la versión', async () => {
    const { clienteId } = await new RegistrarCliente(uow).ejecutar(cliente(2), gerente);
    const consultar = new ConsultarClientes(new ConsultaClientesTypeORM(ds));
    const [encontrado] = await consultar.listar(gerente, dni(2));
    expect(encontrado).toMatchObject({ id: clienteId, estado: 'ACTIVO', version: 1 });

    const r = await new ActualizarCliente(uow).ejecutar(
      clienteId,
      { ...cliente(2), correo: 'it@siger.pe', direccion: 'Av. Ejército 101', version: 1 },
      gerente,
    );
    expect(r).toMatchObject({ codigo: 'MSG-104', version: 2 });
    expect(await consultar.detalle(gerente, clienteId)).toMatchObject({ correo: 'it@siger.pe', version: 2 });
  });

  it('CU-CLI-04: no se inhabilita con una orden activa; tras inhabilitarlo no puede abrir órdenes', async () => {
    const { clienteId } = await new RegistrarCliente(uow).ejecutar(cliente(3), gerente);
    const orden = {
      nombresCliente: 'Cliente IT 3',
      telefono: '959000333',
      documento: dni(3),
      placa: 'ITC-001',
      color: 'Rojo',
      modelo: 'XR150',
      tipoServicio: 'MANTENIMIENTO',
      descripcion: 'Cambio de aceite (prueba de integración)',
    };
    const { ordenId } = await new RegistrarOrdenServicio(uow).ejecutar(orden, gerente);

    const inhabilitar = new InhabilitarCliente(uow);
    await expect(inhabilitar.inhabilitar(clienteId, { version: 1 }, gerente)).rejects.toMatchObject({
      codigo: 'MSG-106',
    });

    // La orden se cancela: ya no hay pendientes y procede la baja lógica (MSG-105).
    await ds.query(`UPDATE tab_os SET estado = 'CANCELADO' WHERE id = $1`, [ordenId]);
    const r = await inhabilitar.inhabilitar(clienteId, { version: 1 }, gerente);
    expect(r).toMatchObject({ codigo: 'MSG-105', estado: 'INACTIVO' });

    // Postcondición: el cliente inactivo no puede abrir una orden nueva (y nada se guarda).
    await expect(
      new RegistrarOrdenServicio(uow).ejecutar({ ...orden, placa: 'ITC-002' }, gerente),
    ).rejects.toMatchObject({ codigo: 'CLIENTE-INACTIVO' });
    const [motos] = await ds.query(`SELECT COUNT(*) AS n FROM tab_moto WHERE placa = 'ITC-002'`);
    expect(Number(motos.n)).toBe(0);

    // CU-CLI-05 / RN-CLI-06: el historial del cliente inactivo se conserva.
    const historial = await new ConsultarClientes(new ConsultaClientesTypeORM(ds)).historial(gerente, clienteId);
    expect(historial.cliente.estado).toBe('INACTIVO');
    expect(historial.ordenes).toHaveLength(1);
    expect(historial.vehiculos).toMatchObject([{ placa: 'ITC-001', origen: 'TALLER' }]);
  });
});
