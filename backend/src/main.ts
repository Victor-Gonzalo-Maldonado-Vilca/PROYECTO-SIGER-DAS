import { config } from './config';
import { crearFuenteDatos } from './acceso_datos/fuenteDatos';
import { ConsultaVentasMotoTypeORM } from './acceso_datos/repositorios/ventas';
import { RepositorioUsuariosTypeORM } from './acceso_datos/repositorios/usuarios';
import { UnidadDeTrabajoTypeORM } from './acceso_datos/UnidadDeTrabajoTypeORM';
import { ConsultaConformidadesTypeORM } from './acceso_datos/repositorios/ordenes';
import { ConsultarConformidades } from './aplicacion/ordenes/ConsultarConformidades';
import { RegistrarConformidadServicio } from './aplicacion/ordenes/RegistrarConformidadServicio';
import { IniciarSesion } from './aplicacion/seguridad/IniciarSesion';
import { ListarVentasMoto } from './aplicacion/ventas/ListarVentasMoto';
import { RegistrarVentaMoto } from './aplicacion/ventas/RegistrarVentaMoto';
import { crearApp } from './comunicacion/http/app';
import { ServicioHashBcrypt, ServicioTokenJwt } from './comunicacion/seguridad/adaptadores';

/**
 * Punto de entrada (composición). Aquí, y solo aquí, se conectan las
 * implementaciones concretas (TypeORM, bcrypt, JWT) con los casos de uso.
 */
async function iniciar() {
  const ds = crearFuenteDatos();
  await ds.initialize();
  console.log(`[SIGER] Conectado a ${config.db.nombre} en ${config.db.host}:${config.db.puerto}`);

  const tokens = new ServicioTokenJwt(config.jwt.secreto, config.jwt.expiraEn);
  const uow = new UnidadDeTrabajoTypeORM(ds);

  const app = crearApp(
    {
      iniciarSesion: new IniciarSesion(new RepositorioUsuariosTypeORM(ds), new ServicioHashBcrypt(), tokens),
      registrarVentaMoto: new RegistrarVentaMoto(uow),
      listarVentasMoto: new ListarVentasMoto(new ConsultaVentasMotoTypeORM(ds)),
      registrarConformidad: new RegistrarConformidadServicio(uow),
      consultarConformidades: new ConsultarConformidades(new ConsultaConformidadesTypeORM(ds)),
    },
    tokens,
    config.corsOrigen,
  );

  app.listen(config.puerto, () => {
    console.log(`[SIGER] API escuchando en http://localhost:${config.puerto}/api`);
  });
}

iniciar().catch((error) => {
  console.error('[SIGER] No se pudo iniciar la API:', error);
  process.exit(1);
});
