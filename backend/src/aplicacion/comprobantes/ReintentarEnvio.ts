import { ErrorDominio } from '../../dominio/compartido/errores';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import { autorizar } from '../seguridad/autorizar';
import type { ProcesarPendientesSunat } from './ProcesarPendientesSunat';

/** «Reintentar ahora» (ILA-0018: «Boleta no emitida, se puede reintentar»). */
export class ReintentarEnvio {
  constructor(private readonly procesador: ProcesarPendientesSunat) {}

  async ejecutar(usuario: UsuarioAutenticado | undefined, comprobanteId: number) {
    autorizar(usuario, Modulos.COMPROBANTES);
    const resultado = await this.procesador.procesarSiguiente(comprobanteId);
    if (!resultado) {
      throw new ErrorDominio(
        'SIN-PENDIENTE',
        'El comprobante no tiene un envío pendiente (ya fue confirmado, rechazado o lo está procesando el job).',
      );
    }
    return resultado;
  }
}
