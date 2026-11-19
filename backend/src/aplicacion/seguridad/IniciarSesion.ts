import { ErrorAutenticacion, ErrorDominio } from '../../dominio/compartido/errores';
import type { CodigoModulo, Rol, UsuarioAutenticado } from '../../dominio/seguridad/permisos';

/** Usuario tal como lo devuelve la persistencia (Tab_usuario + perfil + módulos). */
export interface CuentaUsuario {
  id: number;
  usuario: string;
  contrasenaHash: string;
  nombreCompleto: string;
  estado: 'ACTIVA' | 'INACTIVA';
  rol: Rol;
  modulos: CodigoModulo[];
}

export interface RepositorioUsuarios {
  buscarPorUsuario(usuario: string): Promise<CuentaUsuario | null>;
  registrarIngreso(id: number): Promise<void>;
}

export interface ServicioHash {
  comparar(textoPlano: string, hash: string): Promise<boolean>;
}

export interface ServicioToken {
  emitir(usuario: UsuarioAutenticado): string;
}

/** GestorAcceso.iniciarSesion(usuario, contrasena) — MOD-01, EDU-0017. */
export class IniciarSesion {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly hash: ServicioHash,
    private readonly tokens: ServicioToken,
  ) {}

  async ejecutar(usuario: unknown, contrasena: unknown): Promise<{ token: string; usuario: UsuarioAutenticado }> {
    if (typeof usuario !== 'string' || !usuario.trim() || typeof contrasena !== 'string' || !contrasena) {
      throw new ErrorDominio('MSG-45', 'Ingrese usuario y contraseña.');
    }

    const cuenta = await this.usuarios.buscarPorUsuario(usuario.trim());
    // Mismo mensaje para usuario inexistente y contraseña errónea (no revelar cuál falló).
    if (!cuenta || !(await this.hash.comparar(contrasena, cuenta.contrasenaHash))) {
      throw new ErrorAutenticacion('Usuario o contraseña incorrectos.');
    }
    if (cuenta.estado !== 'ACTIVA') {
      throw new ErrorAutenticacion('La cuenta está desactivada.');
    }

    await this.usuarios.registrarIngreso(cuenta.id);

    const autenticado: UsuarioAutenticado = {
      id: cuenta.id,
      usuario: cuenta.usuario,
      nombreCompleto: cuenta.nombreCompleto,
      rol: cuenta.rol,
      modulos: cuenta.modulos,
    };
    return { token: this.tokens.emitir(autenticado), usuario: autenticado };
  }
}
