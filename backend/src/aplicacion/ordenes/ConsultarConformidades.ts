import { ErrorDominio } from '../../dominio/compartido/errores';
import type { ConsultaConformidades } from '../../dominio/ordenes/repositorios';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import { autorizar } from '../seguridad/autorizar';

/** Consultas de solo lectura de INT-075 (SEL-04, TBL-05/06/07 y listado). */
export class ConsultarConformidades {
  constructor(private readonly consulta: ConsultaConformidades) {}

  /** Paso 3: SEL-04 solo con órdenes aptas. */
  ordenesAptas(usuario: UsuarioAutenticado | undefined) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    return this.consulta.ordenesAptas();
  }

  /** Paso 5: consulta de cliente, vehículo y detalle del servicio. */
  async resumenOrden(usuario: UsuarioAutenticado | undefined, ordenId: number) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    const resumen = await this.consulta.resumenOrden(ordenId);
    if (!resumen) throw new ErrorDominio('MSG-05', 'La orden de servicio no existe.', 'ordenId');
    return resumen;
  }

  listar(usuario: UsuarioAutenticado | undefined) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    return this.consulta.listar();
  }

  async firma(usuario: UsuarioAutenticado | undefined, conformidadId: number) {
    autorizar(usuario, Modulos.ORDENES_SERVICIO);
    const png = await this.consulta.firma(conformidadId);
    if (!png) throw new ErrorDominio('NO-ENCONTRADO', 'Conformidad no encontrada.');
    return png;
  }
}
