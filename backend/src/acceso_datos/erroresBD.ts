import { QueryFailedError } from 'typeorm';
import { ErrorConflicto } from '../dominio/compartido/errores';

/** Restricción única de PostgreSQL -> mensaje del catálogo. */
const RESTRICCIONES_UNICAS: Record<string, ErrorConflicto> = {
  uq_moto_numero_motor: new ErrorConflicto('MSG-46', 'N.° de motor duplicado', 'numeroMotor'),
  uq_moto_numero_chasis: new ErrorConflicto('MSG-47', 'N.° de chasis duplicado', 'numeroChasis'),
  // ILA-0001 / RN-TAL-02: dos recepciones simultáneas de la misma moto o placa.
  uq_os_orden_activa_por_moto: new ErrorConflicto('MSG-30', 'Orden activa existente para la moto.', 'placa'),
  uq_moto_placa: new ErrorConflicto('MSG-30', 'Orden activa existente para la moto.', 'placa'),
  uq_comprobante_por_transaccion: new ErrorConflicto(
    'COMPROBANTE-EXISTE',
    'No se puede emitir la boleta: la transacción ya tiene un comprobante.',
    'transaccion',
  ),
  uq_cs_orden: new ErrorConflicto(
    'MSG-05',
    'Error en el registro de conformidad: la orden ya tiene una conformidad registrada',
    'ordenId',
  ),
};

/**
 * Si dos usuarios registran el mismo motor al mismo tiempo, ambos pasan el SELECT
 * del paso 6, pero el índice único rechaza el segundo INSERT (código 23505).
 * Aquí se traduce ese error técnico al mensaje de negocio correspondiente.
 */
export function traducirErrorBD(error: unknown): unknown {
  if (error instanceof QueryFailedError) {
    const driver = error.driverError as { code?: string; constraint?: string };
    if (driver.code === '23505' && driver.constraint && RESTRICCIONES_UNICAS[driver.constraint]) {
      const base = RESTRICCIONES_UNICAS[driver.constraint];
      return new ErrorConflicto(base.codigo, base.message, base.campo);
    }
  }
  return error;
}
