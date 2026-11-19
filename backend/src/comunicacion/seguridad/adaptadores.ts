import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { ServicioHash, ServicioToken } from '../../aplicacion/seguridad/IniciarSesion';
import { ErrorAutenticacion } from '../../dominio/compartido/errores';
import type { UsuarioAutenticado } from '../../dominio/seguridad/permisos';

export class ServicioHashBcrypt implements ServicioHash {
  comparar(textoPlano: string, hash: string): Promise<boolean> {
    return bcrypt.compare(textoPlano, hash);
  }
}

/** Tokens de sesión JWT (RNF-0005, Vista Física: middleware RBAC/JWT). */
export class ServicioTokenJwt implements ServicioToken {
  constructor(
    private readonly secreto: string,
    private readonly expiraEn: string,
  ) {}

  emitir(usuario: UsuarioAutenticado): string {
    const opciones = { subject: String(usuario.id), expiresIn: this.expiraEn } as SignOptions;
    return jwt.sign(
      { usuario: usuario.usuario, nombre: usuario.nombreCompleto, rol: usuario.rol, modulos: usuario.modulos },
      this.secreto,
      opciones,
    );
  }

  verificar(token: string): UsuarioAutenticado {
    try {
      const datos = jwt.verify(token, this.secreto) as jwt.JwtPayload;
      return {
        id: Number(datos.sub),
        usuario: datos.usuario,
        nombreCompleto: datos.nombre,
        rol: datos.rol,
        modulos: datos.modulos ?? [],
      };
    } catch {
      throw new ErrorAutenticacion();
    }
  }
}
