import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ConsultarComprobantes } from '../../aplicacion/comprobantes/ConsultarComprobantes';
import type { EmitirBoleta } from '../../aplicacion/comprobantes/EmitirBoleta';
import type { ReintentarEnvio } from '../../aplicacion/comprobantes/ReintentarEnvio';
import { MODOS_SUNAT, type ServicioTributarioSimulado } from '../../integraciones/sunat/ServicioTributarioSimulado';
import type { ConsultarConformidades } from '../../aplicacion/ordenes/ConsultarConformidades';
import type { ConsultarOrdenes } from '../../aplicacion/ordenes/ConsultarOrdenes';
import type { RegistrarOrdenServicio } from '../../aplicacion/ordenes/RegistrarOrdenServicio';
import type { ActualizarOrdenServicio } from '../../aplicacion/ordenes/ActualizarOrdenServicio';
import type { RegistrarConformidadServicio } from '../../aplicacion/ordenes/RegistrarConformidadServicio';
import type { ActualizarCliente } from '../../aplicacion/clientes/ActualizarCliente';
import type { ConsultarClientes } from '../../aplicacion/clientes/ConsultarClientes';
import type { InhabilitarCliente } from '../../aplicacion/clientes/InhabilitarCliente';
import type { RegistrarCliente } from '../../aplicacion/clientes/RegistrarCliente';
import type { IniciarSesion } from '../../aplicacion/seguridad/IniciarSesion';
import type { ListarVentasMoto } from '../../aplicacion/ventas/ListarVentasMoto';
import type { AsociarClienteVentaMoto } from '../../aplicacion/ventas/AsociarClienteVentaMoto';
import type { EditarVentaMoto } from '../../aplicacion/ventas/EditarVentaMoto';
import type { RegistrarVentaMoto } from '../../aplicacion/ventas/RegistrarVentaMoto';
import { Modulos } from '../../dominio/seguridad/permisos';
import type { ServicioTokenJwt } from '../seguridad/adaptadores';
import { autenticar, requiereModulo } from './middlewares';

type Manejador = (req: Request, res: Response) => Promise<unknown>;
/** Envía los errores async al manejador central. */
const async = (fn: Manejador) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export interface CasosDeUso {
  iniciarSesion: IniciarSesion;
  registrarVentaMoto: RegistrarVentaMoto;
  listarVentasMoto: ListarVentasMoto;
  asociarCliente: AsociarClienteVentaMoto;
  editarVentaMoto: EditarVentaMoto;
  registrarOrden: RegistrarOrdenServicio;
  actualizarOrden: ActualizarOrdenServicio;
  consultarOrdenes: ConsultarOrdenes;
  registrarConformidad: RegistrarConformidadServicio;
  consultarConformidades: ConsultarConformidades;
  emitirBoleta: EmitirBoleta;
  consultarComprobantes: ConsultarComprobantes;
  reintentarEnvio: ReintentarEnvio;
  registrarCliente: RegistrarCliente;
  actualizarCliente: ActualizarCliente;
  inhabilitarCliente: InhabilitarCliente;
  consultarClientes: ConsultarClientes;
  /** Solo en desarrollo: permite cambiar el modo de la SUNAT simulada. */
  sunatSimulado?: ServicioTributarioSimulado;
}

export function crearRutas(casos: CasosDeUso, tokens: ServicioTokenJwt): Router {
  const r = Router();
  const conSesion = autenticar(tokens);

  r.get('/salud', (_req, res) => res.json({ estado: 'ok', sistema: 'SIGER' }));

  // ---------------- MOD-01 Seguridad (EDU-0017) ----------------
  r.post(
    '/auth/login',
    async(async (req, res) => {
      const resultado = await casos.iniciarSesion.ejecutar(req.body?.usuario, req.body?.contrasena);
      res.json(resultado);
    }),
  );

  r.get('/auth/yo', conSesion, (req, res) => res.json(req.usuario));

  // ---------------- MOD-04 Ventas: venta de motos (EDU-0004) ----------------
  // TBL-18: listado de ventas (?sinCliente=1 -> pendientes de asociación, ILA-0017)
  r.get(
    '/ventas-moto',
    conSesion,
    requiereModulo(Modulos.VENTAS),
    async(async (req, res) => {
      const texto = typeof req.query.q === 'string' ? req.query.q : undefined;
      const soloSinCliente = req.query.sinCliente === '1' || req.query.sinCliente === 'true';
      res.json(await casos.listarVentasMoto.ejecutar(req.usuario, texto, soloSinCliente));
    }),
  );

  // ILA-0017 paso 6: búsqueda de clientes por DNI, RUC o nombres (TBL-12)
  r.get(
    '/ventas-moto/clientes',
    conSesion,
    requiereModulo(Modulos.VENTAS),
    async(async (req, res) => {
      const texto = typeof req.query.q === 'string' ? req.query.q : undefined;
      res.json(await casos.listarVentasMoto.buscarClientes(req.usuario, texto));
    }),
  );

  // CU-VEN-08: BTN-40 Guardar cambios (solo Gerente; el caso de uso lo verifica)
  r.put(
    '/ventas-moto/:id',
    conSesion,
    requiereModulo(Modulos.VENTAS),
    async(async (req, res) =>
      res.json(await casos.editarVentaMoto.ejecutar(Number(req.params.id), req.body ?? {}, req.usuario)),
    ),
  );

  // ILA-0017: BTN-24 Confirmar asociación
  r.put(
    '/ventas-moto/:id/cliente',
    conSesion,
    requiereModulo(Modulos.VENTAS),
    async(async (req, res) =>
      res.json(await casos.asociarCliente.ejecutar(Number(req.params.id), req.body ?? {}, req.usuario)),
    ),
  );

  // ILA-0012: registrar venta de moto
  r.post(
    '/ventas-moto',
    conSesion,
    requiereModulo(Modulos.VENTAS),
    async(async (req, res) => {
      const resultado = await casos.registrarVentaMoto.ejecutar(req.body ?? {}, req.usuario);
      res.status(201).json(resultado);
    }),
  );

  // ---------------- MOD-05 Clientes (EDU-0020, CU-CLI-01 a CU-CLI-05) ----------------
  const clientes = [conSesion, requiereModulo(Modulos.CLIENTES)];

  // CU-CLI-02: TBL-12 con INP-01 (?q=) y SEL-01 (?estado=ACTIVO|INACTIVO)
  r.get(
    '/clientes',
    ...clientes,
    async(async (req, res) => res.json(await casos.consultarClientes.listar(req.usuario, req.query.q, req.query.estado))),
  );

  // CU-CLI-02: BTN-05 Ver detalle
  r.get(
    '/clientes/:id',
    ...clientes,
    async(async (req, res) => res.json(await casos.consultarClientes.detalle(req.usuario, Number(req.params.id)))),
  );

  // CU-CLI-05: BTN-08 Ver historial
  r.get(
    '/clientes/:id/historial',
    ...clientes,
    async(async (req, res) => res.json(await casos.consultarClientes.historial(req.usuario, Number(req.params.id)))),
  );

  // CU-CLI-01: BTN-01 Guardar
  r.post(
    '/clientes',
    ...clientes,
    async(async (req, res) => res.status(201).json(await casos.registrarCliente.ejecutar(req.body ?? {}, req.usuario))),
  );

  // CU-CLI-03: BTN-01 Guardar cambios
  r.put(
    '/clientes/:id',
    ...clientes,
    async(async (req, res) =>
      res.json(await casos.actualizarCliente.ejecutar(Number(req.params.id), req.body ?? {}, req.usuario)),
    ),
  );

  // CU-CLI-04: BTN-04 Inhabilitar (solo Gerente; el caso de uso lo verifica)
  r.post(
    '/clientes/:id/inhabilitar',
    ...clientes,
    async(async (req, res) =>
      res.json(await casos.inhabilitarCliente.inhabilitar(Number(req.params.id), req.body ?? {}, req.usuario)),
    ),
  );

  // Adición: reactivar un cliente inhabilitado (solo Gerente)
  r.post(
    '/clientes/:id/reactivar',
    ...clientes,
    async(async (req, res) =>
      res.json(await casos.inhabilitarCliente.reactivar(Number(req.params.id), req.body ?? {}, req.usuario)),
    ),
  );

  const taller = [conSesion, requiereModulo(Modulos.ORDENES_SERVICIO)];

  // ---------------- MOD-02 Órdenes de servicio (EDU-0001, INT-001) ----------------
  r.get(
    '/ordenes',
    ...taller,
    async(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      res.json(await casos.consultarOrdenes.listar(req.usuario, q));
    }),
  );

  // Paso 2: N.° referencial y fecha al abrir el formulario (BTN-06 Nuevo registro)
  r.get(
    '/ordenes/proximo-numero',
    ...taller,
    async(async (req, res) => res.json(await casos.consultarOrdenes.proximoNumero(req.usuario))),
  );

  // INT-003: detalle de la orden para editar (con SEL-02 permitido e historial)
  r.get(
    '/ordenes/:id',
    ...taller,
    async(async (req, res) => res.json(await casos.consultarOrdenes.detalle(req.usuario, Number(req.params.id)))),
  );

  // CU-TAL-03: BTN-01 Confirmar
  r.put(
    '/ordenes/:id',
    ...taller,
    async(async (req, res) =>
      res.json(await casos.actualizarOrden.ejecutar(Number(req.params.id), req.body ?? {}, req.usuario)),
    ),
  );

  // ILA-0001: BTN-01 Guardar
  r.post(
    '/ordenes',
    ...taller,
    async(async (req, res) => {
      res.status(201).json(await casos.registrarOrden.ejecutar(req.body ?? {}, req.usuario));
    }),
  );

  // ---------------- MOD-02 Conformidad de servicio (EDU-0019, INT-075) ----------------

  // SEL-04: órdenes aptas para conformidad
  r.get(
    '/conformidades/ordenes-aptas',
    ...taller,
    async(async (req, res) => res.json(await casos.consultarConformidades.ordenesAptas(req.usuario))),
  );

  // TBL-05 / TBL-06 / TBL-07: resumen de solo lectura de la orden
  r.get(
    '/conformidades/ordenes/:id',
    ...taller,
    async(async (req, res) =>
      res.json(await casos.consultarConformidades.resumenOrden(req.usuario, Number(req.params.id))),
    ),
  );

  r.get(
    '/conformidades',
    ...taller,
    async(async (req, res) => res.json(await casos.consultarConformidades.listar(req.usuario))),
  );

  r.get(
    '/conformidades/:id/firma',
    ...taller,
    async(async (req, res) => {
      const png = await casos.consultarConformidades.firma(req.usuario, Number(req.params.id));
      res.type('image/png').send(png);
    }),
  );

  // ---------------- MOD-08 Comprobantes de pago (EDU-0005, INT-018) ----------------
  const caja = [conSesion, requiereModulo(Modulos.COMPROBANTES)];

  // TBL-19: transacciones pendientes de boleta (INP-36 / INP-01 + BTN-28 Buscar -> ?q=)
  r.get(
    '/comprobantes/transacciones-pendientes',
    ...caja,
    async(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      res.json(await casos.consultarComprobantes.transaccionesPendientes(req.usuario, q));
    }),
  );

  // Paso 6: vista previa (BTN-21 Emitir Boleta)
  r.get(
    '/comprobantes/vista-previa',
    ...caja,
    async(async (req, res) =>
      res.json(await casos.consultarComprobantes.vistaPrevia(req.usuario, req.query.tipo, req.query.id)),
    ),
  );

  // ILA-0018: BTN-31 Confirmar emisión. 201 si SUNAT la aceptó; 202 si quedó pendiente.
  r.post(
    '/comprobantes/boletas',
    ...caja,
    async(async (req, res) => {
      const resultado = await casos.emitirBoleta.ejecutar(req.body ?? {}, req.usuario);
      res.status(resultado.emitido ? 201 : 202).json(resultado);
    }),
  );

  r.get(
    '/comprobantes',
    ...caja,
    async(async (req, res) => res.json(await casos.consultarComprobantes.listar(req.usuario))),
  );

  // BTN-22 Imprimir o Descargar
  r.get(
    '/comprobantes/:id',
    ...caja,
    async(async (req, res) =>
      res.json(await casos.consultarComprobantes.documento(req.usuario, Number(req.params.id))),
    ),
  );

  r.post(
    '/comprobantes/:id/reintentar',
    ...caja,
    async(async (req, res) => res.json(await casos.reintentarEnvio.ejecutar(req.usuario, Number(req.params.id)))),
  );

  // Solo desarrollo: cambiar el modo de la SUNAT simulada para demostrar fallas.
  if (casos.sunatSimulado) {
    const sunat = casos.sunatSimulado;
    const soloGerente = [conSesion, requiereModulo(Modulos.FINANCIERO)];
    r.get('/dev/sunat-simulado', ...soloGerente, (_req, res) => res.json({ modo: sunat.modo, modos: MODOS_SUNAT }));
    r.put('/dev/sunat-simulado', ...soloGerente, (req, res) => {
      const modo = req.body?.modo;
      if (!MODOS_SUNAT.includes(modo)) {
        return res.status(400).json({ mensaje: `Modo inválido. Use: ${MODOS_SUNAT.join(', ')}` });
      }
      sunat.modo = modo;
      console.log(`[SIGER] SUNAT simulada en modo ${modo}`);
      res.json({ modo });
    });
  }

  // ILA-0075: registrar conformidad (INSERT tab_CS + UPDATE tab_OS en una transacción)
  r.post(
    '/conformidades',
    ...taller,
    async(async (req, res) => {
      const resultado = await casos.registrarConformidad.ejecutar(req.body ?? {}, req.usuario);
      res.status(201).json(resultado);
    }),
  );

  return r;
}
