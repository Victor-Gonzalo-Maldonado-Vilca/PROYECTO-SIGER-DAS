/**
 * MOD-02 Órdenes de Servicio (Vista Lógica §7.4.2, Fig. 4) y diagrama de estados
 * «Orden de Servicio - Estados».
 *
 * POR_ENTREGAR aparece en el diagrama de estados y en ILA-0075, pero no en el enum
 * EstadoOrden de la Vista Lógica: pendiente de uniformar en el catálogo.
 */
export enum EstadoOrden {
  RECEPCIONADO = 'RECEPCIONADO',
  EN_PROCESO = 'EN_PROCESO',
  POR_ENTREGAR = 'POR_ENTREGAR',
  FINALIZADO = 'FINALIZADO',
  ENTREGADO = 'ENTREGADO',
  CANCELADO = 'CANCELADO',
}

/** Datos de la orden que necesita la conformidad (leídos con bloqueo dentro de la transacción). */
export interface OrdenParaConformidad {
  id: number;
  nroOrden: string;
  estado: EstadoOrden;
  proformaId: number | null;
  /** Estado de la proforma asociada (PENDIENTE / APROBADA / RECHAZADA) o null si no tiene. */
  estadoProforma: string | null;
  totalProforma: number | null;
  tieneConformidad: boolean;
}

/**
 * CU-TAL-03 (RN-TAL-05): transiciones que se hacen A MANO desde SEL-02.
 *  - RECEPCIONADO -> EN_PROCESO   «Actualizar avance» (diagrama de estados)
 *  - RECEPCIONADO -> CANCELADO    «Eliminar orden» (diagrama de estados)
 *  - EN_PROCESO   -> POR_ENTREGAR trabajo técnico terminado, lista para la conformidad
 * Las demás las producen otros casos de uso (puntos de extensión de CU-TAL-03):
 *  - -> FINALIZADO: la conformidad de servicio (ILA-0075)
 *  - -> ENTREGADO:  el comprobante emitido (ILA-0018)
 * Decisión: CU-TAL-03 permite EN_PROCESO -> FINALIZADO a mano, pero eso impediría
 * registrar la conformidad (ILA-0075 exige EN_PROCESO o POR_ENTREGAR). Pendiente de
 * uniformar en el catálogo.
 */
export const TRANSICIONES_MANUALES: Record<EstadoOrden, EstadoOrden[]> = {
  [EstadoOrden.RECEPCIONADO]: [EstadoOrden.EN_PROCESO, EstadoOrden.CANCELADO],
  [EstadoOrden.EN_PROCESO]: [EstadoOrden.POR_ENTREGAR],
  [EstadoOrden.POR_ENTREGAR]: [],
  [EstadoOrden.FINALIZADO]: [],
  [EstadoOrden.ENTREGADO]: [],
  [EstadoOrden.CANCELADO]: [],
};

/** RN-TAL-06 y precondición 2 de CU-TAL-03: ENTREGADO y CANCELADO no se editan. */
export function esEditable(estado: EstadoOrden): boolean {
  return estado !== EstadoOrden.ENTREGADO && estado !== EstadoOrden.CANCELADO;
}

export function esTransicionPermitida(actual: EstadoOrden, nuevo: EstadoOrden): boolean {
  return actual === nuevo || TRANSICIONES_MANUALES[actual]?.includes(nuevo) === true;
}

export function leerEstadoOrden(valor: unknown): EstadoOrden | null {
  return (Object.values(EstadoOrden) as string[]).includes(String(valor)) ? (valor as EstadoOrden) : null;
}

const ESTADOS_APTOS_CONFORMIDAD = [EstadoOrden.EN_PROCESO, EstadoOrden.POR_ENTREGAR];

/**
 * Regla del paso 3 de ILA-0075: una orden es apta si
 *  - está En Proceso o Por Entregar,
 *  - su proforma está «liquidada» (se interpreta como APROBADA: la Vista Lógica
 *    no define un estado «liquidada»; pendiente de confirmar),
 *  - y no tiene conformidad previa.
 * Devuelve el motivo si no es apta, o null si lo es.
 */
export function motivoNoAptaParaConformidad(orden: OrdenParaConformidad): string | null {
  if (!ESTADOS_APTOS_CONFORMIDAD.includes(orden.estado)) {
    return `la orden ${orden.nroOrden} está en estado ${orden.estado}`;
  }
  if (orden.estadoProforma !== 'APROBADA') {
    return `la orden ${orden.nroOrden} no tiene una proforma aprobada`;
  }
  if (orden.tieneConformidad) {
    return `la orden ${orden.nroOrden} ya tiene una conformidad registrada`;
  }
  return null;
}
