import {
  ErrorComunicacionSunat,
  type ComprobanteParaEnvio,
  type RespuestaTributaria,
  type ServicioTributario,
} from '../../dominio/comprobantes/ServicioTributario';

/**
 * Modos de la SUNAT simulada (para desarrollo y para demostrar los escenarios
 * del Hito 3 sin depender de un proveedor OSE/PSE real):
 *  NORMAL            acepta el comprobante.
 *  CAIDO             rechaza la conexión: el comprobante NO llegó (reintentable).
 *  RESPUESTA_PERDIDA SUNAT lo registra, pero la respuesta se pierde (incierto -> conciliar).
 *  RECHAZAR          responde con un rechazo explícito.
 */
export type ModoSunatSimulado = 'NORMAL' | 'CAIDO' | 'RESPUESTA_PERDIDA' | 'RECHAZAR';
export const MODOS_SUNAT: ModoSunatSimulado[] = ['NORMAL', 'CAIDO', 'RESPUESTA_PERDIDA', 'RECHAZAR'];

/**
 * Adaptador SIMULADO de ServicioTributario. Guarda en memoria lo que «recibió»,
 * de modo que consultarEstado() funcione igual que la consulta de un OSE/PSE.
 * Se reemplazará por el adaptador del proveedor elegido (Hito 3, Tabla 7).
 */
export class ServicioTributarioSimulado implements ServicioTributario {
  private readonly registrados = new Map<string, RespuestaTributaria>();

  constructor(
    public modo: ModoSunatSimulado = 'NORMAL',
    private readonly latenciaMs = 300,
  ) {}

  async enviarComprobante(c: ComprobanteParaEnvio): Promise<RespuestaTributaria> {
    await this.esperar();
    if (this.modo === 'CAIDO') {
      throw new ErrorComunicacionSunat('No se pudo conectar con la SUNAT (servicio no disponible).', false);
    }

    // Un envío repetido con la misma clave devuelve la respuesta original (idempotencia).
    const previo = this.registrados.get(c.clave);
    if (previo) return previo;

    const respuesta: RespuestaTributaria =
      this.modo === 'RECHAZAR'
        ? { resultado: 'RECHAZADO', codigo: '2800', descripcion: 'Simulación: el comprobante no cumple el formato.' }
        : {
            resultado: 'ACEPTADO',
            codigo: '0',
            descripcion: `La Boleta numero ${c.serie}-${c.numero}, ha sido aceptada (simulación)`,
          };
    this.registrados.set(c.clave, respuesta);

    if (this.modo === 'RESPUESTA_PERDIDA') {
      throw new ErrorComunicacionSunat('Tiempo de espera agotado: no se recibió la respuesta de la SUNAT.', true);
    }
    return respuesta;
  }

  async consultarEstado(clave: string): Promise<RespuestaTributaria | null> {
    await this.esperar();
    if (this.modo === 'CAIDO') {
      throw new ErrorComunicacionSunat('No se pudo conectar con la SUNAT para consultar el estado.', true);
    }
    return this.registrados.get(clave) ?? null;
  }

  private esperar() {
    return new Promise((r) => setTimeout(r, this.latenciaMs));
  }
}
