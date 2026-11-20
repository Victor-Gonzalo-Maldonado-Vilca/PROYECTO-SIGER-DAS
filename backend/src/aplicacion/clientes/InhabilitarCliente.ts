import type { EstadoCliente } from '../../dominio/clientes/Cliente';
import { ErrorAutorizacion, ErrorConflicto, ErrorDominio } from '../../dominio/compartido/errores';
import { Modulos, Rol, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoCambioEstadoCliente {
  codigo: 'MSG-105' | 'CLIENTE-REACTIVADO';
  mensaje: string;
  clienteId: number;
  estado: EstadoCliente;
  version: number;
}

/**
 * CU-CLI-04 — Inhabilitar Cliente (EDU-0020, MOD-05). Solo Gerente/Administrador (ACT-0001).
 *  2. Verifica que no tenga operaciones pendientes -> MSG-106.
 *  3-4. Confirmación (LBL-04) en la interfaz.
 *  5. UPDATE del estado a INACTIVO: baja lógica, nunca borrado físico (RN-CLI-05).
 *  6. MSG-105.
 *
 * reactivar(): adición del equipo (la ficha no la describe). Sin ella, un cliente
 * inhabilitado por error no podría volver a comprar ni abrir órdenes.
 */
export class InhabilitarCliente {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  inhabilitar(clienteId: number, entrada: { version?: unknown }, usuarioSesion: UsuarioAutenticado | undefined) {
    return this.cambiar(clienteId, 'INACTIVO', entrada, usuarioSesion);
  }

  reactivar(clienteId: number, entrada: { version?: unknown }, usuarioSesion: UsuarioAutenticado | undefined) {
    return this.cambiar(clienteId, 'ACTIVO', entrada, usuarioSesion);
  }

  private async cambiar(
    clienteId: number,
    nuevoEstado: EstadoCliente,
    entrada: { version?: unknown },
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoCambioEstadoCliente> {
    const usuario = autorizar(usuarioSesion, Modulos.CLIENTES);
    // Precondición 1: privilegios administrativos directivos (ESP-0053).
    if (usuario.rol !== Rol.GERENTE) {
      throw new ErrorAutorizacion('Solo el gerente puede inhabilitar o reactivar clientes.');
    }
    const versionVista = Number(entrada.version);
    if (!Number.isInteger(versionVista)) {
      throw new ErrorDominio('VAL-VERSION', 'Falta la versión del cliente. Recargue el listado.');
    }

    return this.uow.ejecutar(async (r) => {
      const cliente = await r.clientes.bloquear(clienteId);
      if (!cliente) throw new ErrorDominio('NO-ENCONTRADO', 'El cliente no existe.');
      if (cliente.version !== versionVista) {
        throw new ErrorConflicto('CLIENTE-MODIFICADO', 'Otro usuario modificó este cliente. Recargue el listado.');
      }
      if (cliente.estado === nuevoEstado) {
        const ya = nuevoEstado === 'INACTIVO' ? 'ya está inhabilitado' : 'ya está activo';
        throw new ErrorConflicto('CLIENTE-SIN-CAMBIO', `El cliente ${cliente.nombre} ${ya}.`);
      }

      if (nuevoEstado === 'INACTIVO') {
        // Paso 2 / flujo 2.a. Se consulta DENTRO de la transacción y con el cliente
        // bloqueado, para que no se abra una orden nueva mientras se da de baja.
        const pendientes = await r.clientes.operacionesPendientes(clienteId);
        if (pendientes.length > 0) {
          throw new ErrorConflicto(
            'MSG-106',
            `No es posible inhabilitar el cliente porque registra operaciones pendientes: ${pendientes.join('; ')}.`,
          );
        }
      }

      const version = await r.clientes.cambiarEstado(clienteId, nuevoEstado);
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: nuevoEstado === 'INACTIVO' ? 'INHABILITAR_CLIENTE' : 'REACTIVAR_CLIENTE',
        entidad: 'Tab_cliente',
        entidadId: clienteId,
        detalle: { casoDeUso: 'CU-CLI-04', estadoAnterior: cliente.estado, estadoNuevo: nuevoEstado },
      });

      return nuevoEstado === 'INACTIVO'
        ? { codigo: 'MSG-105', mensaje: 'Cliente inhabilitado correctamente', clienteId, estado: nuevoEstado, version }
        : {
            codigo: 'CLIENTE-REACTIVADO',
            mensaje: 'Cliente reactivado correctamente',
            clienteId,
            estado: nuevoEstado,
            version,
          };
    });
  }
}
