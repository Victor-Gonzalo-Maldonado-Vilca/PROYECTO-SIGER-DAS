import { EstadoComprobante, EstadoPendiente } from '../../dominio/comprobantes/Comprobante';
import type { PendienteTomado } from '../../dominio/comprobantes/repositorios';
import {
  ErrorComunicacionSunat,
  type RespuestaTributaria,
  type ServicioTributario,
} from '../../dominio/comprobantes/ServicioTributario';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';

export interface ResultadoProcesamiento {
  pendienteId: number;
  comprobanteId: number;
  estado: EstadoPendiente;
  detalle: string;
}

/** Tras este número de intentos fallidos se deja para revisión manual. */
export const MAX_INTENTOS = 5;
/** Espera creciente entre reintentos (segundos). */
const ESPERAS = [30, 60, 120, 300, 600];
/** Un EN_PROCESO más antiguo que esto se considera abandonado. */
const MINUTOS_ABANDONO = 5;

/**
 * Job de Reintentos (Vista Física, App-01) — PRO-03 y PRO-04 del Hito 3.
 *
 * Por cada pendiente:
 *  1. TOMA (transacción corta + COMMIT): EN_PROCESO, exclusivo con SKIP LOCKED.
 *  2. ENVÍO a SUNAT FUERA de cualquier transacción SQL: una llamada externa no se
 *     puede «revertir» con ROLLBACK, por eso no se mezcla con la BD.
 *     Si el intento anterior fue incierto, primero CONSULTA (conciliación) y solo
 *     reenvía si SUNAT no lo tiene registrado.
 *  3. REGISTRO de la respuesta (transacción): comprobante + transacción origen +
 *     pendiente, juntos. Si la BD falla aquí, el pendiente queda EN_PROCESO, se
 *     recupera como POR_CONCILIAR y la siguiente pasada consulta a SUNAT.
 */
export class ProcesarPendientesSunat {
  constructor(
    private readonly uow: UnidadDeTrabajo,
    private readonly sunat: ServicioTributario,
  ) {}

  /** Procesa el siguiente pendiente vencido, o el del comprobante indicado. */
  async procesarSiguiente(comprobanteId?: number): Promise<ResultadoProcesamiento | null> {
    const p = await this.uow.ejecutar((r) => r.pendientes.tomarSiguiente(comprobanteId));
    if (!p) return null;

    let respuesta: RespuestaTributaria | null = null;
    try {
      if (p.requiereConsulta) {
        respuesta = await this.sunat.consultarEstado(p.clave); // conciliación
      }
      if (!respuesta) {
        respuesta = await this.sunat.enviarComprobante(p.envio);
      }
    } catch (error) {
      const falla =
        error instanceof ErrorComunicacionSunat
          ? error
          : new ErrorComunicacionSunat(error instanceof Error ? error.message : String(error), true);
      return this.registrarFalla(p, falla);
    }
    return this.registrarRespuesta(p, respuesta);
  }

  /** Una pasada del job: recupera abandonados y procesa hasta `maximo` pendientes. */
  async procesarLote(maximo = 20): Promise<ResultadoProcesamiento[]> {
    await this.uow.ejecutar((r) => r.pendientes.recuperarAbandonados(MINUTOS_ABANDONO));
    const resultados: ResultadoProcesamiento[] = [];
    for (let i = 0; i < maximo; i++) {
      const r = await this.procesarSiguiente();
      if (!r) break;
      resultados.push(r);
    }
    return resultados;
  }

  private registrarRespuesta(p: PendienteTomado, respuesta: RespuestaTributaria): Promise<ResultadoProcesamiento> {
    return this.uow.ejecutar(async (r) => {
      if (respuesta.resultado === 'ACEPTADO') {
        await r.comprobantes.registrarRespuesta(p.comprobanteId, EstadoComprobante.EMITIDO, respuesta.codigo, respuesta.descripcion);
        // Paso 10 de ILA-0018: la transacción origen pasa a «comprobante emitido».
        await r.transacciones.marcarComprobanteEmitido(p.tipoTransaccion, p.transaccionId, p.usuarioId);
        await r.pendientes.actualizar(p.id, { estado: EstadoPendiente.CONFIRMADO, ultimoError: null });
      } else {
        await r.comprobantes.registrarRespuesta(p.comprobanteId, EstadoComprobante.RECHAZADO, respuesta.codigo, respuesta.descripcion);
        await r.pendientes.actualizar(p.id, { estado: EstadoPendiente.RECHAZADO, ultimoError: respuesta.descripcion });
      }
      await r.auditoria.registrar({
        usuarioId: p.usuarioId,
        accion: respuesta.resultado === 'ACEPTADO' ? 'SUNAT_ACEPTA_COMPROBANTE' : 'SUNAT_RECHAZA_COMPROBANTE',
        entidad: 'Tab_comprobante_oficial',
        entidadId: p.comprobanteId,
        detalle: { clave: p.clave, intento: p.intentos, codigo: respuesta.codigo },
      });
      return {
        pendienteId: p.id,
        comprobanteId: p.comprobanteId,
        estado: respuesta.resultado === 'ACEPTADO' ? EstadoPendiente.CONFIRMADO : EstadoPendiente.RECHAZADO,
        detalle: respuesta.descripcion,
      };
    });
  }

  private registrarFalla(p: PendienteTomado, error: ErrorComunicacionSunat): Promise<ResultadoProcesamiento> {
    let estado: EstadoPendiente;
    if (p.intentos >= MAX_INTENTOS) {
      estado = EstadoPendiente.REVISION_REQUERIDA;
    } else if (error.incierto || p.requiereConsulta) {
      // Pudo haber llegado: la próxima vez se consulta antes de reenviar.
      estado = EstadoPendiente.POR_CONCILIAR;
    } else {
      estado = EstadoPendiente.PENDIENTE;
    }
    const espera = ESPERAS[Math.min(p.intentos, ESPERAS.length) - 1] ?? ESPERAS[0];

    return this.uow.ejecutar(async (r) => {
      await r.pendientes.actualizar(p.id, {
        estado,
        ultimoError: error.message.slice(0, 300),
        reintentarEnSegundos: espera,
      });
      return { pendienteId: p.id, comprobanteId: p.comprobanteId, estado, detalle: error.message };
    });
  }
}
