import { ErrorDominio } from '../../dominio/compartido/errores';
import { esEditable, TRANSICIONES_MANUALES } from '../../dominio/ordenes/OrdenServicio';
import type { ConsultaOrdenes } from '../../dominio/ordenes/repositorios';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import { autorizar } from '../seguridad/autorizar';

/** Consulta básica de órdenes (CU-TAL-02) y N.° referencial para INT-001. */
export class ConsultarOrdenes {
  constructor(private readonly consulta: ConsultaOrdenes) {}

  listar(usuario: UsuarioAutenticado | undefined, texto?: string) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    return this.consulta.listar({ texto: texto?.trim() || undefined });
  }

  /** INT-003: datos para editar, estados permitidos en SEL-02 y línea de tiempo. */
  async detalle(usuario: UsuarioAutenticado | undefined, ordenId: number) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    const d = await this.consulta.detalle(ordenId);
    if (!d) throw new ErrorDominio('NO-ENCONTRADO', 'La orden de servicio no existe.');
    return {
      ...d,
      editable: esEditable(d.estado),
      estadosPermitidos: esEditable(d.estado) ? [d.estado, ...TRANSICIONES_MANUALES[d.estado]] : [d.estado],
    };
  }

  async proximoNumero(usuario: UsuarioAutenticado | undefined) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    return { nroOrdenReferencial: await this.consulta.proximoNumero(), fecha: new Date() };
  }
}
