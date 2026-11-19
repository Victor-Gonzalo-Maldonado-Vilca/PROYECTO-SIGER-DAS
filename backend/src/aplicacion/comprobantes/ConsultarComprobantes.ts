import { ErrorDominio } from '../../dominio/compartido/errores';
import { calcularTotales, formatearNumero, SERIE_BOLETA, TipoComprobante } from '../../dominio/comprobantes/Comprobante';
import type { ConsultaComprobantes } from '../../dominio/comprobantes/repositorios';
import { motivoNoEmitibleComoBoleta } from '../../dominio/comprobantes/TransaccionFacturable';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';
import { leerTipoTransaccion } from './EmitirBoleta';

/** Consultas de INT-018 (TBL-19, vista previa, listado y documento). */
export class ConsultarComprobantes {
  constructor(
    private readonly consulta: ConsultaComprobantes,
    private readonly uow: UnidadDeTrabajo,
  ) {}

  /** Pasos 2-4: TBL-19 con transacciones pendientes de boleta (MSG-59 / MSG-60 en la interfaz). */
  transaccionesPendientes(usuario: UsuarioAutenticado | undefined, texto?: string) {
    autorizar(usuario, Modulos.COMPROBANTES);
    return this.consulta.transaccionesPendientesBoleta(texto?.trim() || undefined);
  }

  /** Paso 6: vista previa (N.° referencial, fecha, LBL-10 cliente, LBL-11 detalle, LBL-12 total). */
  async vistaPrevia(usuario: UsuarioAutenticado | undefined, tipoTransaccion: unknown, id: unknown) {
    autorizar(usuario, Modulos.COMPROBANTES);
    const tipo = leerTipoTransaccion(tipoTransaccion);
    // Lectura dentro de una transacción corta: misma regla que usará la emisión.
    const t = await this.uow.ejecutar((r) => r.transacciones.bloquear(tipo, Number(id)));
    if (!t) throw new ErrorDominio('VAL-TRANSACCION', 'La transacción no existe.', 'transaccion');
    const motivo = motivoNoEmitibleComoBoleta(t);
    if (motivo) throw new ErrorDominio('VAL-BOLETA', `No se puede emitir la boleta: ${motivo}.`, 'transaccion');

    const proximo = await this.consulta.proximoNumero(TipoComprobante.BOLETA, SERIE_BOLETA);
    return {
      numeroReferencial: formatearNumero(SERIE_BOLETA, proximo),
      fecha: new Date(),
      transaccion: { tipo: t.tipo, id: t.id, referencia: t.referencia },
      cliente: t.cliente,
      items: t.items,
      ...calcularTotales(t.total),
    };
  }

  listar(usuario: UsuarioAutenticado | undefined) {
    autorizar(usuario, Modulos.COMPROBANTES);
    return this.consulta.listar();
  }

  /** BTN-22 Imprimir o Descargar. */
  async documento(usuario: UsuarioAutenticado | undefined, id: number) {
    autorizar(usuario, Modulos.COMPROBANTES);
    const doc = await this.consulta.documento(id);
    if (!doc) throw new ErrorDominio('NO-ENCONTRADO', 'Comprobante no encontrado.');
    return doc;
  }
}
