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
