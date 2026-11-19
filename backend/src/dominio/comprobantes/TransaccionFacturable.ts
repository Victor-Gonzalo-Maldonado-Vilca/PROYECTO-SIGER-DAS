/**
 * Interfaz TransaccionFacturable (Vista Lógica, MOD-08): la cumplen OrdenServicio,
 * VentaMoto y VentaRepuesto para poder liquidarse con un comprobante.
 *   obtenerCliente(), obtenerItems(), obtenerTotal(), marcarComprobanteEmitido()
 */
export enum TipoTransaccion {
  VENTA_MOTO = 'VENTA_MOTO',
  ORDEN_SERVICIO = 'ORDEN_SERVICIO',
  VENTA_REPUESTO = 'VENTA_REPUESTO', // pendiente: aún no existe la venta de repuestos
}

export interface ItemFacturable {
  descripcion: string;
  cantidad: number;
  importe: number;
}

export interface ClienteAdquiriente {
  id: number;
  tipoDocumento: 'DNI' | 'RUC';
  numeroDocumento: string;
  nombre: string;
}

export interface TransaccionFacturable {
  tipo: TipoTransaccion;
  id: number;
  /** N.° visible: VM-2026-0001, ORD-2026-0005, ... */
  referencia: string;
  fecha: Date;
  cliente: ClienteAdquiriente | null;
  items: ItemFacturable[];
  total: number;
  /** Si la transacción está en un estado que permite generar su comprobante. */
  listaParaComprobante: boolean;
  /** Si ya tiene un comprobante vigente (GENERADO o EMITIDO). */
  tieneComprobante: boolean;
}

/**
 * Reglas para emitir BOLETA (ILA-0018: «clientes personas naturales»).
 * Devuelve el motivo si no se puede, o null.
 */
export function motivoNoEmitibleComoBoleta(t: TransaccionFacturable): string | null {
  if (t.tieneComprobante) return `la transacción ${t.referencia} ya tiene un comprobante`;
  if (!t.listaParaComprobante) return `la transacción ${t.referencia} no está lista para comprobante`;
  if (!t.cliente) return `la transacción ${t.referencia} no tiene cliente asociado`;
  if (t.cliente.tipoDocumento !== 'DNI') return 'el cliente es persona jurídica: corresponde factura, no boleta';
  if (!(t.total > 0)) return `la transacción ${t.referencia} no tiene un monto válido`;
  return null;
}
