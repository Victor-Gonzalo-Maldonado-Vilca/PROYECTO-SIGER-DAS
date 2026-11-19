import type { NextFunction, Request, Response } from 'express';
import {
  ErrorAutenticacion,
  ErrorAutorizacion,
  ErrorConflicto,
  ErrorDominio,
} from '../../dominio/compartido/errores';
import { habilitaModulo, type CodigoModulo, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { ServicioTokenJwt } from '../seguridad/adaptadores';

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioAutenticado;
  }
}

/** Autenticación: exige "Authorization: Bearer <token>". */
export function autenticar(tokens: ServicioTokenJwt) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const cabecera = req.header('authorization') ?? '';
    const [tipo, token] = cabecera.split(' ');
    if (tipo !== 'Bearer' || !token) {
      return next(new ErrorAutenticacion());
    }
    try {
      req.usuario = tokens.verificar(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** RBAC por módulo (API Gateway). El caso de uso vuelve a verificarlo. */
export function requiereModulo(modulo: CodigoModulo) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario || !habilitaModulo(req.usuario, modulo)) {
      return next(new ErrorAutorizacion());
    }
    next();
  };
}

/** Traduce los errores del núcleo a respuestas HTTP con el código de mensaje del catálogo. */
export function manejarErrores(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ErrorConflicto) {
    return res.status(409).json({ codigo: error.codigo, mensaje: error.message, campo: error.campo });
  }
  if (error instanceof ErrorDominio) {
    return res.status(400).json({ codigo: error.codigo, mensaje: error.message, campo: error.campo });
  }
  if (error instanceof ErrorAutenticacion) {
    return res.status(401).json({ mensaje: error.message });
  }
  if (error instanceof ErrorAutorizacion) {
    return res.status(403).json({ mensaje: error.message });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ mensaje: 'El cuerpo de la solicitud no es un JSON válido.' });
  }
  // Error técnico: se registra en el servidor y no se exponen detalles al cliente.
  console.error('[SIGER] Error no controlado:', error);
  return res.status(500).json({
    mensaje: 'No se pudo completar la operación por un error técnico. No se registraron cambios.',
  });
}
