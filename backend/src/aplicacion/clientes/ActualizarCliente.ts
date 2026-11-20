import { errorDocumentoDuplicado, validarDatosCliente } from '../../dominio/clientes/Cliente';
import { ErrorConflicto, ErrorDominio } from '../../dominio/compartido/errores';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoActualizacionCliente {
  codigo: 'MSG-104';
  mensaje: string;
  clienteId: number;
  version: number;
}

/**
 * CU-CLI-03 — Actualizar Datos de Cliente (EDU-0020, MOD-05).
 *  5. Valida formatos.
 *  6. Si cambió el documento, verifica que no pertenezca a otro cliente (RN-CLI-04) -> MSG-102.
 *  7. UPDATE atómico de Tab_cliente.
 *  8. MSG-104.
 * Reglas adicionales:
 *  - Un cliente registrado en el taller sin documento puede completarlo aquí; pero si
 *    ya tenía DNI/RUC no puede quitarse, porque sus comprobantes lo usan.
 *  - Bloqueo optimista (RNF-0008): si otro usuario guardó primero, se informa en vez
 *    de sobrescribir sus cambios.
 */
export class ActualizarCliente {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(
    clienteId: number,
    entrada: Record<string, unknown>,
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoActualizacionCliente> {
    const usuario = autorizar(usuarioSesion, Modulos.CLIENTES);
    const versionVista = Number(entrada.version);
    if (!Number.isInteger(versionVista)) {
      throw new ErrorDominio('VAL-VERSION', 'Falta la versión del cliente. Recargue el listado.');
    }

    return this.uow.ejecutar(async (r) => {
      const actual = await r.clientes.bloquear(clienteId);
      if (!actual) throw new ErrorDominio('NO-ENCONTRADO', 'El cliente no existe.');
      if (actual.version !== versionVista) {
        throw new ErrorConflicto('CLIENTE-MODIFICADO', 'Otro usuario modificó este cliente. Recargue el listado.');
      }

      const datos = validarDatosCliente(entrada, actual.numeroDocumento !== null);
      if (
        datos.numeroDocumento &&
        datos.numeroDocumento !== actual.numeroDocumento &&
        (await r.clientes.existeDocumento(datos.numeroDocumento, clienteId))
      ) {
        throw errorDocumentoDuplicado();
      }

      const version = await r.clientes.actualizar(clienteId, datos);
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'ACTUALIZAR_CLIENTE',
        entidad: 'Tab_cliente',
        entidadId: clienteId,
        detalle: {
          casoDeUso: 'CU-CLI-03',
          documentoAnterior: actual.numeroDocumento,
          documentoNuevo: datos.numeroDocumento,
        },
      });
      return { codigo: 'MSG-104', mensaje: 'Datos del cliente actualizados correctamente', clienteId, version };
    });
  }
}
