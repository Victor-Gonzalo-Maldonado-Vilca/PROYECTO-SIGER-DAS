import type { DataSource } from 'typeorm';
import type { CuentaUsuario, RepositorioUsuarios } from '../../aplicacion/seguridad/IniciarSesion';
import type { CodigoModulo, Rol } from '../../dominio/seguridad/permisos';

/** Lectura de Tab_usuario + perfil + módulos habilitados (MOD-01). */
export class RepositorioUsuariosTypeORM implements RepositorioUsuarios {
  constructor(private readonly ds: DataSource) {}

  async buscarPorUsuario(usuario: string): Promise<CuentaUsuario | null> {
    const filas: Array<Record<string, unknown>> = await this.ds.query(
      `SELECT u.id, u.usuario, u.contrasena_hash, u.nombre_completo, u.estado,
              p.rol_asociado,
              COALESCE(ARRAY_AGG(pm.modulo_codigo ORDER BY pm.modulo_codigo)
                       FILTER (WHERE pm.modulo_codigo IS NOT NULL), '{}') AS modulos
         FROM tab_usuario u
         JOIN tab_perfil_permiso p      ON p.id = u.perfil_id
    LEFT JOIN tab_perfil_modulo pm      ON pm.perfil_id = p.id
        WHERE u.usuario = $1
     GROUP BY u.id, p.rol_asociado`,
      [usuario],
    );
    const f = filas[0];
    if (!f) return null;
    return {
      id: Number(f.id),
      usuario: String(f.usuario),
      contrasenaHash: String(f.contrasena_hash),
      nombreCompleto: String(f.nombre_completo),
      estado: f.estado as CuentaUsuario['estado'],
      rol: f.rol_asociado as Rol,
      modulos: f.modulos as CodigoModulo[],
    };
  }

  async registrarIngreso(id: number): Promise<void> {
    await this.ds.query('UPDATE tab_usuario SET ultimo_ingreso = NOW() WHERE id = $1', [id]);
  }
}
