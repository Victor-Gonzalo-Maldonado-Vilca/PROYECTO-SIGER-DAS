import { config } from './config';
import { crearFuenteDatos } from './acceso_datos/fuenteDatos';
import { ConsultaComprobantesTypeORM } from './acceso_datos/repositorios/comprobantes';
import { ConsultaConformidadesTypeORM, ConsultaOrdenesTypeORM } from './acceso_datos/repositorios/ordenes';
import { ConsultarOrdenes } from './aplicacion/ordenes/ConsultarOrdenes';
import { RegistrarOrdenServicio } from './aplicacion/ordenes/RegistrarOrdenServicio';
import { ActualizarOrdenServicio } from './aplicacion/ordenes/ActualizarOrdenServicio';
import { ConsultaVentasMotoTypeORM } from './acceso_datos/repositorios/ventas';
import { RepositorioUsuariosTypeORM } from './acceso_datos/repositorios/usuarios';
import { UnidadDeTrabajoTypeORM } from './acceso_datos/UnidadDeTrabajoTypeORM';
import { ConsultarComprobantes } from './aplicacion/comprobantes/ConsultarComprobantes';
import { EmitirBoleta } from './aplicacion/comprobantes/EmitirBoleta';
import { ProcesarPendientesSunat } from './aplicacion/comprobantes/ProcesarPendientesSunat';
import { ReintentarEnvio } from './aplicacion/comprobantes/ReintentarEnvio';
import { ConsultarConformidades } from './aplicacion/ordenes/ConsultarConformidades';
import { RegistrarConformidadServicio } from './aplicacion/ordenes/RegistrarConformidadServicio';
import { IniciarSesion } from './aplicacion/seguridad/IniciarSesion';
import { ListarVentasMoto } from './aplicacion/ventas/ListarVentasMoto';
import { AsociarClienteVentaMoto } from './aplicacion/ventas/AsociarClienteVentaMoto';
import { EditarVentaMoto } from './aplicacion/ventas/EditarVentaMoto';
import { RegistrarVentaMoto } from './aplicacion/ventas/RegistrarVentaMoto';
import { crearApp } from './comunicacion/http/app';
import { ServicioHashBcrypt, ServicioTokenJwt } from './comunicacion/seguridad/adaptadores';
import { iniciarJobReintentos } from './integraciones/JobReintentos';
import {
  MODOS_SUNAT,
  ServicioTributarioSimulado,
  type ModoSunatSimulado,
} from './integraciones/sunat/ServicioTributarioSimulado';

/**
 * Punto de entrada (composición). Aquí, y solo aquí, se conectan las
 * implementaciones concretas (TypeORM, bcrypt, JWT, SUNAT) con los casos de uso.
 */
async function iniciar() {
  const ds = crearFuenteDatos();
  await ds.initialize();
  console.log(`[SIGER] Conectado a ${config.db.nombre} en ${config.db.host}:${config.db.puerto}`);

  const tokens = new ServicioTokenJwt(config.jwt.secreto, config.jwt.expiraEn);
  const uow = new UnidadDeTrabajoTypeORM(ds);

  // Integración SUNAT: simulador hasta elegir el proveedor OSE/PSE.
  const modo = MODOS_SUNAT.includes(config.sunat.modoSimulado as ModoSunatSimulado)
    ? (config.sunat.modoSimulado as ModoSunatSimulado)
    : 'NORMAL';
  const sunat = new ServicioTributarioSimulado(modo);
  console.log(`[SIGER] SUNAT: adaptador SIMULADO en modo ${modo}`);
  const procesadorSunat = new ProcesarPendientesSunat(uow, sunat);

  const app = crearApp(
    {
      iniciarSesion: new IniciarSesion(new RepositorioUsuariosTypeORM(ds), new ServicioHashBcrypt(), tokens),
      registrarVentaMoto: new RegistrarVentaMoto(uow),
      listarVentasMoto: new ListarVentasMoto(new ConsultaVentasMotoTypeORM(ds)),
      asociarCliente: new AsociarClienteVentaMoto(uow),
      editarVentaMoto: new EditarVentaMoto(uow),
      registrarOrden: new RegistrarOrdenServicio(uow),
      actualizarOrden: new ActualizarOrdenServicio(uow),
      consultarOrdenes: new ConsultarOrdenes(new ConsultaOrdenesTypeORM(ds)),
      registrarConformidad: new RegistrarConformidadServicio(uow),
      consultarConformidades: new ConsultarConformidades(new ConsultaConformidadesTypeORM(ds)),
      emitirBoleta: new EmitirBoleta(uow, procesadorSunat),
      consultarComprobantes: new ConsultarComprobantes(new ConsultaComprobantesTypeORM(ds), uow),
      reintentarEnvio: new ReintentarEnvio(procesadorSunat),
      sunatSimulado: config.esProduccion ? undefined : sunat,
    },
    tokens,
    config.corsOrigen,
  );

  iniciarJobReintentos(procesadorSunat, config.jobIntervaloMs);
  console.log(`[SIGER] Job de reintentos SUNAT cada ${config.jobIntervaloMs / 1000} s`);

  app.listen(config.puerto, () => {
    console.log(`[SIGER] API escuchando en http://localhost:${config.puerto}/api`);
  });
}

iniciar().catch((error) => {
  console.error('[SIGER] No se pudo iniciar la API:', error);
  process.exit(1);
});
