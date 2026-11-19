import { ErrorConflicto, ErrorDominio } from '../../dominio/compartido/errores';
import {
  calcularTotales,
  claveIdempotencia,
  EstadoPendiente,
  formatearNumero,
  SERIE_BOLETA,
  TipoComprobante,
} from '../../dominio/comprobantes/Comprobante';
import { motivoNoEmitibleComoBoleta, TipoTransaccion } from '../../dominio/comprobantes/TransaccionFacturable';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';
import type { ProcesarPendientesSunat } from './ProcesarPendientesSunat';

export interface ResultadoEmision {
  codigo: 'MSG-62' | 'MSG-61' | 'RECHAZO-SUNAT';
  mensaje: string;
  emitido: boolean;
  comprobanteId: number;
  numeroCompleto: string;
  estadoEnvio: EstadoPendiente;
}

export function leerTipoTransaccion(valor: unknown): TipoTransaccion {
  const tipos = Object.values(TipoTransaccion) as string[];
  if (typeof valor !== 'string' || !tipos.includes(valor)) {
    throw new ErrorDominio('VAL-TRANSACCION', 'Seleccione una transacción válida.', 'transaccion');
  }
  return valor as TipoTransaccion;
}

/**
 * ILA-0018 — Emitir boleta de venta para clientes personas naturales (EDU-0005, INT-018).
 * Clase de control: GestorComprobantes.generarComprobante() + emitir().
 *
 * Con la propuesta PRO-03/PRO-04 del Hito 3 (en vez de esperar a SUNAT ANTES de registrar):
 *  A. Transacción local (BTN-31 Confirmar):
 *     bloquea la transacción origen, valida que sea de persona natural y sin comprobante,
 *     toma el número correlativo de la serie B001, INSERT del comprobante (GENERADO) e
 *     INSERT del pendiente (outbox), y COMMIT. Nada de esto es todavía «aceptado por SUNAT».
 *  B. Primer intento inmediato (paso 8) con el mismo código del Job de Reintentos:
 *     - aceptado  -> MSG-62 y la transacción origen pasa a «comprobante emitido» (pasos 9-12).
 *     - sin respuesta -> MSG-61: la transacción mantiene su estado; el job reintentará.
 */
export class EmitirBoleta {
  constructor(
    private readonly uow: UnidadDeTrabajo,
    private readonly procesador: ProcesarPendientesSunat,
  ) {}

  async ejecutar(
    entrada: { tipoTransaccion?: unknown; transaccionId?: unknown },
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoEmision> {
    const usuario = autorizar(usuarioSesion, Modulos.COMPROBANTES);
    const tipo = leerTipoTransaccion(entrada.tipoTransaccion);
    const transaccionId = Number(entrada.transaccionId);
    if (!Number.isInteger(transaccionId) || transaccionId <= 0) {
      throw new ErrorDominio('VAL-TRANSACCION', 'Seleccione una transacción válida.', 'transaccion');
    }

    // A. Registro local + outbox (una sola transacción)
    const generado = await this.uow.ejecutar(async (r) => {
      const t = await r.transacciones.bloquear(tipo, transaccionId);
      if (!t) throw new ErrorDominio('VAL-TRANSACCION', 'La transacción no existe.', 'transaccion');
      const motivo = motivoNoEmitibleComoBoleta(t);
      if (motivo) {
        throw t.tieneComprobante
          ? new ErrorConflicto('COMPROBANTE-EXISTE', `No se puede emitir la boleta: ${motivo}.`, 'transaccion')
          : new ErrorDominio('VAL-BOLETA', `No se puede emitir la boleta: ${motivo}.`, 'transaccion');
      }

      const emisor = await r.comprobantes.emisor();
      const numero = await r.comprobantes.siguienteNumero(TipoComprobante.BOLETA, SERIE_BOLETA);
      const totales = calcularTotales(t.total);
      const { id } = await r.comprobantes.guardar({
        tipo: TipoComprobante.BOLETA,
        serie: SERIE_BOLETA,
        numero,
        ...totales,
        emisorId: emisor.id,
        clienteId: t.cliente!.id,
        tipoTransaccion: t.tipo,
        transaccionId: t.id,
        detalle: t.items,
        usuarioId: usuario.id,
      });
      await r.pendientes.crear(id, claveIdempotencia(emisor.ruc, TipoComprobante.BOLETA, SERIE_BOLETA, numero));
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'GENERAR_BOLETA',
        entidad: 'Tab_comprobante_oficial',
        entidadId: id,
        detalle: { ilacion: 'ILA-0018', transaccion: t.referencia, numero: formatearNumero(SERIE_BOLETA, numero) },
      });
      return { comprobanteId: id, numeroCompleto: formatearNumero(SERIE_BOLETA, numero) };
    });

    // B. Primer intento inmediato de envío a SUNAT
    const resultado = await this.procesador.procesarSiguiente(generado.comprobanteId);
    const estadoEnvio = resultado?.estado ?? EstadoPendiente.EN_PROCESO;

    if (estadoEnvio === EstadoPendiente.CONFIRMADO) {
      return {
        codigo: 'MSG-62',
        mensaje: 'Boleta emitida y registrada exitosamente ante la SUNAT',
        emitido: true,
        estadoEnvio,
        ...generado,
      };
    }
    if (estadoEnvio === EstadoPendiente.RECHAZADO) {
      return {
        codigo: 'RECHAZO-SUNAT',
        mensaje: `La SUNAT rechazó la boleta: ${resultado?.detalle ?? 'sin detalle'}`,
        emitido: false,
        estadoEnvio,
        ...generado,
      };
    }
    return {
      codigo: 'MSG-61',
      mensaje:
        'Error de comunicación con la SUNAT: el comprobante no fue emitido y la transacción mantiene su estado. ' +
        'La boleta quedó pendiente y se reintentará automáticamente.',
      emitido: false,
      estadoEnvio,
      ...generado,
    };
  }
}
