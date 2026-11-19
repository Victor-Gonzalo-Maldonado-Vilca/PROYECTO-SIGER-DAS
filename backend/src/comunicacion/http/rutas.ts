import { Router, type NextFunction, type Request, type Response } from 'express';
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

  return r;
}
