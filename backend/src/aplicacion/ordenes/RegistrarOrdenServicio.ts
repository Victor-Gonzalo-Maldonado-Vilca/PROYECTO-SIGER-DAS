import { ErrorConflicto } from '../../dominio/compartido/errores';
import { EstadoOrden } from '../../dominio/ordenes/OrdenServicio';
import { validarDatosRecepcion } from '../../dominio/ordenes/RecepcionOrden';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoRegistroOrden {
  codigo: 'LBL-01';
  mensaje: string;
  ordenId: number;
  nroOrden: string;
  /** LBL-03 */
  estado: EstadoOrden;
  fechaRecepcion: Date;
}

export function errorOrdenActiva(nroOrden?: string) {
  return new ErrorConflicto(
    'MSG-30',
    `Orden activa existente para la moto${nroOrden ? ` (${nroOrden})` : ''}.`,
    'placa',
  );
}

/**
 * ILA-0001 — Aperturar / registrar orden de servicio (EDU-0001, INT-001, CU-TAL-01).
 * Clase de control: GestorOrdenServicio.registrarOrden() (Vista Lógica, ejemplo MVC).
 *
 *  6.  Valida obligatoriedad y formato (MSG-23, 24, 25, 28, 29).
 *      Se valida ANTES de consultar la placa (la ficha lo indica después, paso 5),
 *      porque la unicidad solo puede verificarse con una placa válida.
 *  5.  «Validar Unicidad de Placa Sin Orden Activa» (RN-TAL-02) -> MSG-30.
 *  7.  INSERT en Tab_orden_servicio con estado RECEPCIONADO y N.° ORD-AAAA-XXXX.
 *  8.  Registro inicial en Tab_trazabilidad.
 *      Todo en UNA transacción: cliente, moto, orden, trazabilidad y auditoría.
 *  9.  LBL-01 confirmación y LBL-03 estado «Recepcionado».
 */
export class RegistrarOrdenServicio {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(entrada: Record<string, unknown>, usuarioSesion: UsuarioAutenticado | undefined): Promise<ResultadoRegistroOrden> {
    const usuario = autorizar(usuarioSesion, Modulos.ORDENES_SERVICIO);
    const datos = validarDatosRecepcion(entrada);

    return this.uow.ejecutar(async (r) => {
      const clienteId = await r.clientes.obtenerOCrear({
        nombre: datos.nombresCliente,
        telefono: datos.telefono,
        documento: datos.documento,
      });

      // La moto se reconoce por su placa; si es la primera vez que ingresa, se registra.
      const moto = await r.motos.bloquearPorPlaca(datos.placa);
      const motoId =
        moto?.id ??
        (await r.motos.registrarRecibida({ placa: datos.placa, color: datos.color, modelo: datos.modelo, clienteId }));

      // Paso 5 / RN-TAL-02 (el índice único parcial lo refuerza ante registros simultáneos).
      const activa = await r.ordenes.ordenActivaDeMoto(motoId);
      if (activa) throw errorOrdenActiva(activa);

      const orden = await r.ordenes.registrar({
        clienteId,
        motoId,
        tipoServicio: datos.tipoServicio,
        descripcion: datos.descripcion,
      });
      await r.historialOrden.registrar({
        ordenId: orden.id,
        anterior: null,
        nuevo: EstadoOrden.RECEPCIONADO,
        usuarioId: usuario.id,
      });
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'REGISTRAR_ORDEN_SERVICIO',
        entidad: 'Tab_orden_servicio',
        entidadId: orden.id,
        detalle: { ilacion: 'ILA-0001', nroOrden: orden.nroOrden, placa: datos.placa },
      });

      return {
        codigo: 'LBL-01',
        mensaje: 'Orden de servicio registrada correctamente',
        ordenId: orden.id,
        nroOrden: orden.nroOrden,
        estado: EstadoOrden.RECEPCIONADO,
        fechaRecepcion: orden.fechaRecepcion,
      };
    });
  }
}
