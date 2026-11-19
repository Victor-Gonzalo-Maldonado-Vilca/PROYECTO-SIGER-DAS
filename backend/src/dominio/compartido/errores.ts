/**
 * Errores del núcleo de SIGER.
 *
 * Los códigos MSG-xx provienen del Catálogo de Requisitos (mensajes de interfaz).
 * La capa de Comunicación traduce cada tipo de error a un código HTTP; el dominio
 * no conoce HTTP ni la base de datos.
 */

/** Violación de una regla o invariante del negocio (datos inválidos, duplicados, etc.). */
export class ErrorDominio extends Error {
  constructor(
    /** Código del mensaje del catálogo, p. ej. "MSG-45". */
    readonly codigo: string,
    mensaje: string,
    /** Campo del formulario relacionado (para resaltarlo en la interfaz). */
    readonly campo?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}

/** La operación choca con un dato ya existente (p. ej. N.° de motor duplicado). */
export class ErrorConflicto extends ErrorDominio {
  constructor(codigo: string, mensaje: string, campo?: string) {
    super(codigo, mensaje, campo);
    this.name = 'ErrorConflicto';
  }
}

/** Credenciales inválidas o sesión ausente/expirada. */
export class ErrorAutenticacion extends Error {
  constructor(mensaje = 'Sesión no válida. Inicie sesión nuevamente.') {
    super(mensaje);
    this.name = 'ErrorAutenticacion';
  }
}

/** El usuario está autenticado pero su perfil no habilita la operación (RBAC, RNF-0005). */
export class ErrorAutorizacion extends Error {
  constructor(mensaje = 'Su perfil no tiene permiso para realizar esta operación.') {
    super(mensaje);
    this.name = 'ErrorAutorizacion';
  }
}
