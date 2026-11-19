import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { ConsultaVentasMoto, FilaVentaMoto } from '../../dominio/ventas/repositorios';
import { autorizar } from '../seguridad/autorizar';

/**
 * Listado de ventas de motos (TBL-12, paso 9 de ILA-0012).
 * Es una consulta: usa un repositorio de lectura sin transacción de escritura
 * (mismo criterio que PRO-07: separar lecturas de modificaciones).
 */
export class ListarVentasMoto {
  constructor(private readonly consulta: ConsultaVentasMoto) {}

  async ejecutar(usuarioSesion: UsuarioAutenticado | undefined, texto?: string): Promise<FilaVentaMoto[]> {
    autorizar(usuarioSesion, Modulos.VENTAS);
    return this.consulta.listar({ texto: texto?.trim() || undefined });
  }
}
