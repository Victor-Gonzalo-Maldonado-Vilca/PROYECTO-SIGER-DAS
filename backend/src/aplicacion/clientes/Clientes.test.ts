import { beforeEach, describe, expect, it } from 'vitest';
import type { EntradaAuditoria } from '../../dominio/auditoria/RepositorioAuditoria';
import type { Cliente } from '../../dominio/clientes/Cliente';
import type { RepositorioClientes } from '../../dominio/clientes/repositorios';
import { ErrorAutorizacion, ErrorConflicto } from '../../dominio/compartido/errores';
import { Modulos, Rol, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { RepositoriosTransaccionales, UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { ActualizarCliente } from './ActualizarCliente';
import { InhabilitarCliente } from './InhabilitarCliente';
import { RegistrarCliente } from './RegistrarCliente';

/**
 * Pruebas de MOD-05 sin base de datos: la unidad de trabajo falsa solo confirma
 * los cambios si el caso de uso termina sin error (imita COMMIT/ROLLBACK).
 */
class BaseFalsa {
  clientes: Cliente[] = [];
  pendientes: Record<number, string[]> = {};
  auditoria: EntradaAuditoria[] = [];
}

class UnidadDeTrabajoFalsa implements UnidadDeTrabajo {
  constructor(private readonly bd: BaseFalsa) {}

  async ejecutar<T>(trabajo: (repos: RepositoriosTransaccionales) => Promise<T>): Promise<T> {
    const tx = { clientes: this.bd.clientes.map((c) => ({ ...c })), auditoria: [...this.bd.auditoria] };
    const buscar = (id: number) => tx.clientes.find((c) => c.id === id);
    const clientes: Partial<RepositorioClientes> = {
      existeDocumento: async (n, excluir) => tx.clientes.some((c) => c.numeroDocumento === n && c.id !== excluir),
      registrar: async (d) => {
        const id = tx.clientes.length + 1;
        tx.clientes.push({ ...d, id, estado: 'ACTIVO', version: 1 });
        return id;
      },
      bloquear: async (id) => (buscar(id) ? { ...buscar(id)! } : null),
      actualizar: async (id, d) => {
        const c = buscar(id)!;
        Object.assign(c, d, { version: c.version + 1 });
        return c.version;
      },
      operacionesPendientes: async (id) => this.bd.pendientes[id] ?? [],
      cambiarEstado: async (id, estado) => {
        const c = buscar(id)!;
        c.estado = estado;
        c.version += 1;
        return c.version;
      },
    };
    const resultado = await trabajo({
      clientes: clientes as RepositorioClientes,
      auditoria: { registrar: async (e) => void tx.auditoria.push(e) },
    } as RepositoriosTransaccionales);
    Object.assign(this.bd, tx);
    return resultado;
  }
}

const usuario = (rol: Rol): UsuarioAutenticado => ({
  id: rol === Rol.GERENTE ? 1 : 2,
  usuario: rol.toLowerCase(),
  nombreCompleto: rol,
  rol,
  modulos: [Modulos.CLIENTES],
});
const gerente = usuario(Rol.GERENTE);
const vendedor = usuario(Rol.VENDEDOR);
const mecanico: UsuarioAutenticado = { ...usuario(Rol.MECANICO), modulos: [Modulos.ORDENES_SERVICIO] };

const carlos = { tipoDocumento: 'DNI', numeroDocumento: '45678912', nombre: 'Carlos Pérez', telefono: '959111222' };

let bd: BaseFalsa;
let uow: UnidadDeTrabajoFalsa;

beforeEach(() => {
  bd = new BaseFalsa();
  uow = new UnidadDeTrabajoFalsa(bd);
});

describe('CU-CLI-01 Registrar cliente', () => {
  it('registra en estado ACTIVO, audita y responde MSG-101', async () => {
    const r = await new RegistrarCliente(uow).ejecutar(carlos, vendedor);
    expect(r.codigo).toBe('MSG-101');
    expect(bd.clientes[0]).toMatchObject({ numeroDocumento: '45678912', estado: 'ACTIVO' });
    expect(bd.auditoria[0].accion).toBe('REGISTRAR_CLIENTE');
  });

  it('rechaza un documento ya registrado con MSG-102 sin insertar nada', async () => {
    await new RegistrarCliente(uow).ejecutar(carlos, vendedor);
    await expect(new RegistrarCliente(uow).ejecutar({ ...carlos, nombre: 'Otro' }, vendedor)).rejects.toMatchObject({
      codigo: 'MSG-102',
    });
    expect(bd.clientes).toHaveLength(1);
  });

  it('exige el permiso del módulo MOD-05', async () => {
    await expect(new RegistrarCliente(uow).ejecutar(carlos, mecanico)).rejects.toBeInstanceOf(ErrorAutorizacion);
  });
});

describe('CU-CLI-03 Actualizar cliente', () => {
  beforeEach(async () => {
    await new RegistrarCliente(uow).ejecutar(carlos, vendedor);
    await new RegistrarCliente(uow).ejecutar({ ...carlos, numeroDocumento: '70123456', nombre: 'María' }, vendedor);
  });

  it('actualiza los datos, sube la versión y responde MSG-104', async () => {
    const r = await new ActualizarCliente(uow).ejecutar(
      1,
      { ...carlos, telefono: '958000111', correo: 'carlos@mail.com', version: 1 },
      vendedor,
    );
    expect(r).toMatchObject({ codigo: 'MSG-104', version: 2 });
    expect(bd.clientes[0]).toMatchObject({ telefono: '958000111', correo: 'carlos@mail.com' });
  });

  it('no permite tomar el documento de otro cliente (MSG-102)', async () => {
    await expect(
      new ActualizarCliente(uow).ejecutar(1, { ...carlos, numeroDocumento: '70123456', version: 1 }, vendedor),
    ).rejects.toMatchObject({ codigo: 'MSG-102' });
  });

  it('no permite quitar el documento de un cliente que ya lo tenía', async () => {
    await expect(
      new ActualizarCliente(uow).ejecutar(1, { ...carlos, tipoDocumento: '', numeroDocumento: '', version: 1 }, vendedor),
    ).rejects.toMatchObject({ campo: 'tipoDocumento' });
  });

  it('detecta que otro usuario lo modificó antes (bloqueo optimista)', async () => {
    await expect(
      new ActualizarCliente(uow).ejecutar(1, { ...carlos, version: 7 }, vendedor),
    ).rejects.toBeInstanceOf(ErrorConflicto);
    expect(bd.clientes[0].version).toBe(1);
  });
});

describe('CU-CLI-04 Inhabilitar cliente', () => {
  beforeEach(async () => {
    await new RegistrarCliente(uow).ejecutar(carlos, vendedor);
  });

  it('solo el gerente puede inhabilitar', async () => {
    await expect(new InhabilitarCliente(uow).inhabilitar(1, { version: 1 }, vendedor)).rejects.toBeInstanceOf(
      ErrorAutorizacion,
    );
  });

  it('hace la baja lógica y responde MSG-105', async () => {
    const r = await new InhabilitarCliente(uow).inhabilitar(1, { version: 1 }, gerente);
    expect(r).toMatchObject({ codigo: 'MSG-105', estado: 'INACTIVO' });
    expect(bd.clientes[0].estado).toBe('INACTIVO');
    expect(bd.auditoria.at(-1)?.accion).toBe('INHABILITAR_CLIENTE');
  });

  it('bloquea la baja si hay operaciones pendientes (MSG-106)', async () => {
    bd.pendientes[1] = ['1 orden(es) de servicio sin entregar'];
    await expect(new InhabilitarCliente(uow).inhabilitar(1, { version: 1 }, gerente)).rejects.toMatchObject({
      codigo: 'MSG-106',
    });
    expect(bd.clientes[0].estado).toBe('ACTIVO');
  });

  it('permite reactivar a un cliente inhabilitado', async () => {
    await new InhabilitarCliente(uow).inhabilitar(1, { version: 1 }, gerente);
    const r = await new InhabilitarCliente(uow).reactivar(1, { version: 2 }, gerente);
    expect(r.estado).toBe('ACTIVO');
  });
});
