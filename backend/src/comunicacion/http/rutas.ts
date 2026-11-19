import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ConsultarConformidades } from '../../aplicacion/ordenes/ConsultarConformidades';
import type { RegistrarConformidadServicio } from '../../aplicacion/ordenes/RegistrarConformidadServicio';
import type { IniciarSesion } from '../../aplicacion/seguridad/IniciarSesion';
import type { ListarVentasMoto } from '../../aplicacion/ventas/ListarVentasMoto';
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
  registrarConformidad: RegistrarConformidadServicio;
  consultarConformidades: ConsultarConformidades;
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
  // TBL-12: listado de ventas
  r.get(
    '/ventas-moto',
    conSesion,
    requiereModulo(Modulos.VENTAS),
    async(async (req, res) => {
      const texto = typeof req.query.q === 'string' ? req.query.q : undefined;
      res.json(await casos.listarVentasMoto.ejecutar(req.usuario, texto));
    }),
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

  // ---------------- MOD-02 Conformidad de servicio (EDU-0019, INT-075) ----------------
  const taller = [conSesion, requiereModulo(Modulos.ORDENES_SERVICIO)];

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
