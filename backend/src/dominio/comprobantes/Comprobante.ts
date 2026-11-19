/**
 * MOD-08 Comprobantes de Pago (Vista Lógica §7.4.7, Fig. 9).
 * Restricciones: { estado EMITIDO inmutable } { eliminación solo en estado GENERADO }.
 */

export enum TipoComprobante {
  BOLETA = 'BOLETA', // adquiriente PersonaNatural (DNI)
  FACTURA = 'FACTURA', // adquiriente PersonaJuridica (RUC)
}

/** Código de tipo de documento usado por SUNAT en la clave del comprobante. */
const CODIGO_SUNAT: Record<TipoComprobante, string> = {
  [TipoComprobante.BOLETA]: '03',
  [TipoComprobante.FACTURA]: '01',
};

/**
 * EstadoComprobante de la Vista Lógica (GENERADO, EMITIDO) + RECHAZADO para
 * registrar un rechazo explícito de SUNAT (Hito 3, Fig. 5 «Rechazo informado»).
 */
export enum EstadoComprobante {
  GENERADO = 'GENERADO',
  EMITIDO = 'EMITIDO',
  RECHAZADO = 'RECHAZADO',
}

/**
 * Estados técnicos de la solicitud de envío (Tab_comprobante_pendiente),
 * propuestos en el Hito 3 (PRO-03, PRO-04, Fig. 5). NO son estados oficiales de SUNAT.
 */
export enum EstadoPendiente {
  PENDIENTE = 'PENDIENTE', // persistido; no equivale a aceptación tributaria
  EN_PROCESO = 'EN_PROCESO', // tomado por un worker de forma exclusiva
  CONFIRMADO = 'CONFIRMADO', // SUNAT aceptó y se guardó junto con el estado de la transacción origen
  RECHAZADO = 'RECHAZADO', // rechazo explícito guardado
  POR_CONCILIAR = 'POR_CONCILIAR', // resultado incierto: consultar antes de reenviar
  REVISION_REQUERIDA = 'REVISION_REQUERIDA', // la conciliación automática no pudo decidir
}

export const SERIE_BOLETA = 'B001';
export const TASA_IGV = 0.18;

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Comprobante.calcularTotales(): los precios de venta de SIGER INCLUYEN IGV
 * (supuesto pendiente de confirmar con el negocio). El IGV se obtiene por diferencia
 * para que subtotal + igv = total exactamente.
 */
export function calcularTotales(totalConIgv: number): { subtotal: number; igv: number; total: number } {
  const total = redondear(totalConIgv);
  const subtotal = redondear(total / (1 + TASA_IGV));
  return { subtotal, igv: redondear(total - subtotal), total };
}

/** Número con 8 dígitos, como en la representación impresa: B001-00000001. */
export function formatearNumero(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(8, '0')}`;
}

/**
 * Clave estable del comprobante (PRO-04): RUC emisor + tipo + serie + número.
 * Es la misma en cada reintento, por lo que SUNAT puede reconocer un envío repetido
 * y SIGER puede consultar el estado antes de retransmitir.
 */
export function claveIdempotencia(ruc: string, tipo: TipoComprobante, serie: string, numero: number): string {
  return `${ruc}-${CODIGO_SUNAT[tipo]}-${serie}-${numero}`;
}
