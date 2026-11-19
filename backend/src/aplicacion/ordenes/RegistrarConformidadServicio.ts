import { ErrorConflicto } from '../../dominio/compartido/errores';
import { errorConformidad, validarEntradaConformidad } from '../../dominio/ordenes/ConformidadServicio';
import { EstadoOrden, motivoNoAptaParaConformidad } from '../../dominio/ordenes/OrdenServicio';
import type { ItemServicio } from '../../dominio/ordenes/repositorios';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoConformidad {
  codigo: 'LBL-01';
  mensaje: string;
  conformidadId: number;
  nroConformidad: string;
  fechaEmision: Date;
  ordenId: number;
}

const describir = (items: ItemServicio[]) =>
  items.map((i) => (i.cantidad > 1 ? `${i.descripcion} x${i.cantidad}` : i.descripcion)).join('; ');

/**
 * Caso de uso ILA-0075 — Registro de Conformidad de Servicio (EDU-0019, INT-075).
 * Clase de control: GestorOrdenServicio.generarConformidad() de la Vista Lógica.
 *
 * Flujo (Vista de Procesos v02.00):
 *  8.  ¿Orden seleccionada, datos íntegros y firma de PAD-01 no vacía?  No -> MSG-05
 *  9.  INSERT en tab_CS (metadatos del documento + firma digitalizada)
 *  10. UPDATE en tab_OS: la orden pasa a FINALIZADO (postcondición)
 *      9 y 10 forman UNA transacción (Hito 3 §8.4, RNF-0004): si algo falla,
 *      se revierte y la orden conserva su estado anterior.
 *  11. LBL-01 «Conformidad registrada y documento generado».
 */
export class RegistrarConformidadServicio {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(
    entrada: { ordenId?: unknown; kilometraje?: unknown; firma?: unknown },
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoConformidad> {
    const usuario = autorizar(usuarioSesion, Modulos.ORDENES_SERVICIO);
    const datos = validarEntradaConformidad(entrada);

    return this.uow.ejecutar(async (repos) => {
      // Bloquea la orden: una segunda conformidad simultánea espera aquí y luego ve tieneConformidad = true.
      const orden = await repos.ordenes.bloquearParaConformidad(datos.ordenId);
      if (!orden) {
        throw errorConformidad('la orden de servicio no existe', 'ordenId');
      }
      const motivo = motivoNoAptaParaConformidad(orden);
      if (motivo) {
        throw orden.tieneConformidad
          ? new ErrorConflicto('MSG-05', `Error en el registro de conformidad: ${motivo}`, 'ordenId')
          : errorConformidad(motivo, 'ordenId');
      }

      const items = await repos.ordenes.itemsDeProforma(orden.proformaId!);
      const servicios = items.filter((i) => i.tipoItem === 'SERVICIO');
      const insumos = items.filter((i) => i.tipoItem === 'REPUESTO');

      // Paso 9
      const cs = await repos.conformidades.guardar({
        ordenId: orden.id,
        proformaId: orden.proformaId,
        kilometraje: datos.kilometraje,
        trabajosRealizados: describir(servicios) || 'Sin servicios detallados',
        insumosEmpleados: describir(insumos) || 'Sin insumos',
        precioTotal: orden.totalProforma ?? 0,
        firmaPng: datos.firmaPng,
        usuarioId: usuario.id,
      });

      // Paso 10 (+ bitácora HistorialEstado y auditoría en la misma transacción)
      const estadoAnterior = orden.estado;
      await repos.ordenes.cambiarEstado(orden.id, EstadoOrden.FINALIZADO);
      await repos.historialOrden.registrar({
        ordenId: orden.id,
        anterior: estadoAnterior,
        nuevo: EstadoOrden.FINALIZADO,
        usuarioId: usuario.id,
      });
      await repos.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'REGISTRAR_CONFORMIDAD',
        entidad: 'tab_CS',
        entidadId: cs.id,
        detalle: { ilacion: 'ILA-0075', ordenId: orden.id, nroConformidad: cs.nroConformidad },
      });

      return {
        codigo: 'LBL-01',
        mensaje: 'Conformidad registrada y documento generado',
        conformidadId: cs.id,
        nroConformidad: cs.nroConformidad,
        fechaEmision: cs.fechaEmision,
        ordenId: orden.id,
      };
    });
  }
}
