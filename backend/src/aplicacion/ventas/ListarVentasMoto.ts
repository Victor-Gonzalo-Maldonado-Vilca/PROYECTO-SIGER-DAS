import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { ConsultaVentasMoto, FilaClienteBusqueda, FilaVentaMoto } from '../../dominio/ventas/repositorios';
import { autorizar } from '../seguridad/autorizar';

/**
 * Listado de ventas de motos (TBL-18; paso 9 de ILA-0012 y paso 2 de ILA-0017)
 * y búsqueda de clientes para la asociación (TBL-12, ILA-0017).
 * Son consultas: usan repositorios de lectura sin transacción de escritura
 * (mismo criterio que PRO-07: separar lecturas de modificaciones).
 */
export class ListarVentasMoto {
  constructor(private readonly consulta: ConsultaVentasMoto) {}

  async ejecutar(
    usuarioSesion: UsuarioAutenticado | undefined,
    texto?: string,
    soloSinCliente = false,
  ): Promise<FilaVentaMoto[]> {
    autorizar(usuarioSesion, Modulos.VENTAS);
    return this.consulta.listar({ texto: texto?.trim() || undefined, soloSinCliente });
  }

  /** CU-VEN-10 paso 6. Un criterio vacío devuelve lista vacía (no se lista todo el padrón). */
  async buscarClientes(usuarioSesion: UsuarioAutenticado | undefined, texto?: string): Promise<FilaClienteBusqueda[]> {
    autorizar(usuarioSesion, Modulos.VENTAS);
    const criterio = texto?.trim() ?? '';
    return criterio.length >= 2 ? this.consulta.buscarClientes(criterio) : [];
  }
}
