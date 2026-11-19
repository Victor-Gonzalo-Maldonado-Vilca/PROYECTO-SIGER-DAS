/**
 * Interfaz ServicioTributario (Vista Lógica, MOD-08): abstrae la plataforma SUNAT
 * (OSE/PSE). El dominio y la aplicación dependen SOLO de esta interfaz; el adaptador
 * real se implementará en integraciones/ cuando se elija el proveedor.
 */

export interface ComprobanteParaEnvio {
  clave: string;
  tipo: 'BOLETA' | 'FACTURA';
  serie: string;
  numero: number;
  fechaEmision: Date;
  emisor: { ruc: string; razonSocial: string };
  adquiriente: { tipoDocumento: string; numeroDocumento: string; nombre: string };
  items: Array<{ descripcion: string; cantidad: number; importe: number }>;
  subtotal: number;
  igv: number;
  total: number;
}

export type RespuestaTributaria =
  | { resultado: 'ACEPTADO'; codigo: string; descripcion: string }
  | { resultado: 'RECHAZADO'; codigo: string; descripcion: string };

/**
 * Falla de comunicación con SUNAT.
 *  - incierto = false: se sabe que el comprobante NO llegó (p. ej. conexión rechazada).
 *    Se puede reintentar el envío.
 *  - incierto = true: pudo haber llegado (p. ej. se envió y se perdió la respuesta).
 *    Hay que CONSULTAR antes de reenviar (conciliación, Hito 3 §8.3).
 */
export class ErrorComunicacionSunat extends Error {
  constructor(
    mensaje: string,
    readonly incierto: boolean,
  ) {
    super(mensaje);
    this.name = 'ErrorComunicacionSunat';
  }
}

export interface ServicioTributario {
  enviarComprobante(c: ComprobanteParaEnvio): Promise<RespuestaTributaria>;
  /** Consulta el estado por clave. null = SUNAT no tiene registrado ese comprobante. */
  consultarEstado(clave: string): Promise<RespuestaTributaria | null>;
}
