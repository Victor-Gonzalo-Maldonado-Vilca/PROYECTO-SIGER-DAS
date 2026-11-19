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

  async proximoNumero(usuario: UsuarioAutenticado | undefined) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    return { nroOrdenReferencial: await this.consulta.proximoNumero(), fecha: new Date() };
  }
}
