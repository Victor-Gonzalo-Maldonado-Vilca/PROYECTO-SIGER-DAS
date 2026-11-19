import { ErrorDominio } from '../compartido/errores';

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

/** Precio máximo razonable de una moto (evita errores de digitación como 549000). */
const PRECIO_MAXIMO = 200_000;

/**
 * Precio de venta en soles, con IGV incluido (ILA-0018 lo separa al emitir la boleta).
 * ADICIÓN al catálogo: ILA-0012 / CU-VEN-06 no capturan el precio, pero el comprobante
 * (ILA-0018) necesita un monto. Pendiente de registrar en el catálogo actualizado.
 */
export function validarPrecioVenta(valor: unknown): number {
  const texto = typeof valor === 'string' ? valor.trim().replace(',', '.') : valor;
  if (texto === undefined || texto === null || texto === '') {
    throw new ErrorDominio('MSG-45', 'Campo obligatorio vacío: Precio de venta', 'precio');
  }
  const precio = Number(texto);
  if (!Number.isFinite(precio) || precio <= 0 || precio > PRECIO_MAXIMO) {
    throw new ErrorDominio('VAL-PRECIO', `El precio debe ser mayor que 0 y menor o igual a S/ ${PRECIO_MAXIMO.toLocaleString('es-PE')}.`, 'precio');
  }
  if (Math.round(precio * 100) !== Math.round(precio * 100 * 1000) / 1000) {
    throw new ErrorDominio('VAL-PRECIO', 'El precio admite como máximo 2 decimales.', 'precio');
  }
  return Math.round(precio * 100) / 100;
}

export class VentaMoto {
  private constructor(
    readonly estado: EstadoVenta,
    readonly registradaPor: number,
    readonly precio: number,
  ) {}

  /** ILA-0012: la venta nace sin cliente; el cliente se asocia en ILA-0017. */
  static registrar(usuarioId: number, precio: number): VentaMoto {
    return new VentaMoto(EstadoVenta.SIN_CLIENTE, usuarioId, precio);
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
