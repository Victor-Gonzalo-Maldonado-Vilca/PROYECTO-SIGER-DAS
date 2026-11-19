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
