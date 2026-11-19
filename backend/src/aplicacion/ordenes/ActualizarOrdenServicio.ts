import { ErrorConflicto, ErrorDominio } from '../../dominio/compartido/errores';
import {
  EstadoOrden,
  esEditable,
  esTransicionPermitida,
  leerEstadoOrden,
} from '../../dominio/ordenes/OrdenServicio';
import { validarDatosEditables } from '../../dominio/ordenes/RecepcionOrden';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoActualizacionOrden {
  codigo: 'LBL-01';
  mensaje: string;
  nroOrden: string;
  /** LBL-03 */
  estado: EstadoOrden;
  version: number;
}

/**
 * CU-TAL-03 — Actualizar avance y estado de la orden (EDU-0001/EDU-0002, INT-003).
 * Clase de control: GestorOrdenServicio.cambiarEstado() / actualizar().
 *
 *  2.  La orden no debe estar ENTREGADO ni CANCELADO (2.a, RN-TAL-06).
 *  6.  Valida obligatorios (6.b: MSG-23 a MSG-29) y que la transición sea válida (6.a).
 *      Bloqueo optimista (RNF-0008): si otro usuario guardó cambios desde que se abrió
 *      el formulario, la versión no coincide y se pide recargar (no se pisan cambios ajenos).
 *  7.  Tab_trazabilidad: registra el cambio de estado (anterior -> nuevo, usuario, fecha).
 *  8.  UPDATE de la orden, del contacto del cliente y de la descripción de la moto.
 *      Todo en UNA transacción ACID (criterio de aceptación de la ficha).
 *  9.  LBL-01 confirmación y LBL-03 estado.
 * La placa (INP-03) no se edita en esta versión: identifica a la moto y es la base de
 * RN-TAL-02 (ver observaciones del README).
 */
export class ActualizarOrdenServicio {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(
    ordenId: number,
    entrada: Record<string, unknown>,
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoActualizacionOrden> {
    const usuario = autorizar(usuarioSesion, Modulos.ORDENES_SERVICIO);
    const datos = validarDatosEditables(entrada);
    const nuevoEstado = leerEstadoOrden(entrada.estado);
    if (!nuevoEstado) throw new ErrorDominio('VAL-ESTADO', 'Seleccione el estado de la orden.', 'estado');
    const versionVista = Number(entrada.version);
    if (!Number.isInteger(versionVista)) {
      throw new ErrorDominio('VAL-VERSION', 'Falta la versión de la orden. Recargue el formulario.');
    }

    return this.uow.ejecutar(async (r) => {
      const orden = await r.ordenes.bloquearParaEdicion(ordenId);
      if (!orden) throw new ErrorDominio('NO-ENCONTRADO', 'La orden de servicio no existe.');

      if (!esEditable(orden.estado)) {
        throw new ErrorDominio(
          'ORDEN-NO-EDITABLE',
          `Órdenes en estado ${orden.estado === EstadoOrden.ENTREGADO ? 'Entregado' : 'Cancelado'} no pueden editarse.`,
        );
      }
      if (orden.version !== versionVista) {
        throw new ErrorConflicto(
          'ORDEN-MODIFICADA',
          `Otro usuario modificó la orden ${orden.nroOrden} mientras usted la editaba. Recargue para ver los cambios.`,
        );
      }
      if (!esTransicionPermitida(orden.estado, nuevoEstado)) {
        throw new ErrorDominio('TRANSICION-NO-PERMITIDA', 'Transición de estado no permitida.', 'estado');
      }

      const version = await r.ordenes.actualizarDatos(orden.id, {
        tipoServicio: datos.tipoServicio,
        descripcion: datos.descripcion,
        estado: nuevoEstado,
      });
      await r.clientes.actualizarContacto(orden.clienteId, datos.nombresCliente, datos.telefono);
      await r.motos.actualizarDescripcion(orden.motoId, datos.color, datos.modelo);

      if (nuevoEstado !== orden.estado) {
        await r.historialOrden.registrar({
          ordenId: orden.id,
          anterior: orden.estado,
          nuevo: nuevoEstado,
          usuarioId: usuario.id,
        });
      }
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'ACTUALIZAR_ORDEN_SERVICIO',
        entidad: 'Tab_orden_servicio',
        entidadId: orden.id,
        detalle: { casoDeUso: 'CU-TAL-03', estadoAnterior: orden.estado, estadoNuevo: nuevoEstado, datos },
      });

      return {
        codigo: 'LBL-01',
        mensaje: 'Orden de servicio actualizada correctamente',
        nroOrden: orden.nroOrden,
        estado: nuevoEstado,
        version,
      };
    });
  }
}
