import cors from 'cors';
import express, { type Express } from 'express';
import type { ServicioTokenJwt } from '../seguridad/adaptadores';
import { manejarErrores } from './middlewares';
import { crearRutas, type CasosDeUso } from './rutas';

/** Capa de Comunicación: API REST/JSON (límite cliente-servidor). */
export function crearApp(casos: CasosDeUso, tokens: ServicioTokenJwt, corsOrigen: string): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigen }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', crearRutas(casos, tokens));
  app.use('/api', (_req, res) => res.status(404).json({ mensaje: 'Recurso no encontrado.' }));
  app.use(manejarErrores);
  return app;
}
