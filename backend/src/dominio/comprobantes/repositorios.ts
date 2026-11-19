import type { ComprobanteParaEnvio } from './ServicioTributario';
import type { EstadoComprobante, EstadoPendiente, TipoComprobante } from './Comprobante';
import type { ItemFacturable, TipoTransaccion, TransaccionFacturable } from './TransaccionFacturable';

export interface DatosEmisor {
  id: number;
  ruc: string;
  razonSocial: string;
  direccionFiscal: string;
}

/** Acceso a las transacciones que realizan TransaccionFacturable. */
export interface RepositorioTransaccionesFacturables {
  /** Lee la transacción con bloqueo FOR UPDATE (dentro de la transacción en curso). */
  bloquear(tipo: TipoTransaccion, id: number): Promise<TransaccionFacturable | null>;
  /**
   * marcarComprobanteEmitido(): VentaMoto -> COMPROBANTE_EMITIDO;
   * OrdenServicio -> ENTREGADO («Vincular comprobante» del diagrama de estados de la orden).
   */
  marcarComprobanteEmitido(tipo: TipoTransaccion, id: number, usuarioId: number): Promise<void>;
}

export interface NuevoComprobante {
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  subtotal: number;
  igv: number;
  total: number;
  emisorId: number;
  clienteId: number;
  tipoTransaccion: TipoTransaccion;
  transaccionId: number;
  detalle: ItemFacturable[];
  usuarioId: number;
}

export interface RepositorioComprobantes {
  emisor(): Promise<DatosEmisor>;
  /** Toma el siguiente número de la serie sin huecos (UPDATE ... RETURNING). */
  siguienteNumero(tipo: TipoComprobante, serie: string): Promise<number>;
  guardar(c: NuevoComprobante): Promise<{ id: number; fechaEmision: Date }>;
  registrarRespuesta(id: number, estado: EstadoComprobante, codigo: string, descripcion: string): Promise<void>;
}

/** Fila de Tab_comprobante_pendiente tomada por un worker, con lo necesario para enviar. */
export interface PendienteTomado {
  id: number;
  comprobanteId: number;
  clave: string;
  intentos: number;
  /** true si el intento anterior fue incierto: consultar antes de reenviar. */
  requiereConsulta: boolean;
  tipoTransaccion: TipoTransaccion;
  transaccionId: number;
  /** Usuario que generó el comprobante (para la auditoría del job). */
  usuarioId: number;
  envio: ComprobanteParaEnvio;
}

export interface RepositorioPendientes {
  crear(comprobanteId: number, clave: string): Promise<number>;
  /**
   * Toma de forma EXCLUSIVA el siguiente pendiente vencido (o el indicado),
   * con SELECT ... FOR UPDATE SKIP LOCKED, y lo pasa a EN_PROCESO.
   * Dos instancias del job nunca toman la misma fila.
   */
  tomarSiguiente(comprobanteId?: number): Promise<PendienteTomado | null>;
  actualizar(
    id: number,
    cambios: { estado: EstadoPendiente; ultimoError?: string | null; reintentarEnSegundos?: number },
  ): Promise<void>;
  /** Pasa a POR_CONCILIAR los EN_PROCESO abandonados (el worker murió a mitad del envío). */
  recuperarAbandonados(minutos: number): Promise<number>;
}

// ------------------------- Consultas (solo lectura) -------------------------

/** Fila de TBL-19: transacción pendiente de boleta. */
export interface FilaTransaccionPendiente {
  tipo: TipoTransaccion;
  id: number;
  referencia: string;
  cliente: string;
  documento: string;
  total: number;
  fecha: Date;
}

export interface FilaComprobante {
  id: number;
  tipo: TipoComprobante;
  numeroCompleto: string;
  fechaEmision: Date;
  cliente: string;
  total: number;
  estado: EstadoComprobante;
  estadoEnvio: EstadoPendiente | null;
  intentos: number;
  ultimoError: string | null;
  referenciaTransaccion: string;
  codigoRespuesta: string | null;
}

export interface DocumentoComprobante {
  id: number;
  tipo: TipoComprobante;
  numeroCompleto: string;
  fechaEmision: Date;
  estado: EstadoComprobante;
  emisor: DatosEmisor;
  cliente: { tipoDocumento: string; numeroDocumento: string; nombre: string };
  items: ItemFacturable[];
  subtotal: number;
  igv: number;
  total: number;
  codigoRespuesta: string | null;
  descripcionRespuesta: string | null;
}

export interface ConsultaComprobantes {
  transaccionesPendientesBoleta(texto?: string): Promise<FilaTransaccionPendiente[]>;
  /** Próximo número de la serie (solo referencial para la vista previa). */
  proximoNumero(tipo: TipoComprobante, serie: string): Promise<number>;
  listar(): Promise<FilaComprobante[]>;
  documento(id: number): Promise<DocumentoComprobante | null>;
}
