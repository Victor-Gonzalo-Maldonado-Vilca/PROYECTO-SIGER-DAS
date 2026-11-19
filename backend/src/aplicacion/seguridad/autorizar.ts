import { ErrorAutorizacion } from '../../dominio/compartido/errores';
import { habilitaModulo, type CodigoModulo, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';

/**
 * Verificación de permiso dentro del caso de uso.
 * La API ya filtra por módulo, pero el Hito 3 (Tabla 4) exige verificarlo también aquí
 * para que una ruta interna o un job no puedan eludir el control de acceso.
 */
export function autorizar(usuario: UsuarioAutenticado | undefined, modulo: CodigoModulo): UsuarioAutenticado {
  if (!usuario || !habilitaModulo(usuario, modulo)) {
    throw new ErrorAutorizacion();
  }
  return usuario;
}
