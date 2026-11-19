/**
 * Entidad VentaMoto (Vista Lógica, MOD-04, Fig. 6).
 *
 * Estados tomados del diagrama de estados «Venta de Motocicleta»:
 *   [registrar venta] -> SIN_CLIENTE -> [asociar cliente, ILA-0017] -> CON_CLIENTE
 *   -> [generar comprobante] -> COMPROBANTE_EMITIDO
 * Restricción: { con comprobante emitido => no editable ni eliminable } (ILA-0014).
 */
export enum EstadoVenta {
  SIN_CLIENTE = 'SIN_CLIENTE',
  CON_CLIENTE = 'CON_CLIENTE',
  COMPROBANTE_EMITIDO = 'COMPROBANTE_EMITIDO',
}

export class VentaMoto {
  private constructor(
    readonly estado: EstadoVenta,
    readonly registradaPor: number,
  ) {}

  /** ILA-0012: la venta nace sin cliente; el cliente se asocia en ILA-0017. */
  static registrar(usuarioId: number): VentaMoto {
    return new VentaMoto(EstadoVenta.SIN_CLIENTE, usuarioId);
  }

  static esModificable(estado: EstadoVenta): boolean {
    return estado !== EstadoVenta.COMPROBANTE_EMITIDO;
  }
}

/** Cliente candidato a comprador (datos mínimos para validar la asociación). */
export interface ClienteComprador {
  id: number;
  nombre: string;
  tipoDocumento: 'DNI' | 'RUC' | null;
  numeroDocumento: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
}

/**
 * Reglas de ILA-0017 / CU-VEN-10 «Asociar cliente a venta de moto».
 *  - Precondición 2: la venta debe estar SIN_CLIENTE (diagrama de estados: SinCliente -> ConCliente).
 *  - RN-VEN-15: el comprador debe ser un cliente FISCAL (con DNI o RUC) para poder
 *    emitir después el comprobante. Un cliente registrado en el taller sin documento
 *    no se acepta (decisión pendiente de confirmar en el catálogo).
 *  - Un cliente dado de baja (INACTIVO) no puede asociarse.
 * Devuelve el motivo si no se puede asociar, o null.
 */
export function motivoNoAsociable(estadoVenta: EstadoVenta, cliente: ClienteComprador): string | null {
  if (estadoVenta === EstadoVenta.COMPROBANTE_EMITIDO) return 'la venta ya tiene un comprobante emitido';
  if (estadoVenta !== EstadoVenta.SIN_CLIENTE) return 'la venta ya tiene un cliente asociado';
  if (cliente.estado !== 'ACTIVO') return `el cliente ${cliente.nombre} está dado de baja`;
  if (!cliente.tipoDocumento) {
    return `el cliente ${cliente.nombre} no tiene DNI ni RUC registrado; complete sus datos fiscales en Clientes (MOD-05)`;
  }
  return null;
}
