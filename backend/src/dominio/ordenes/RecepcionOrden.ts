import { ErrorDominio } from '../compartido/errores';
import { EstadoOrden } from './OrdenServicio';

/**
 * ILA-0001 / CU-TAL-01 «Aperturar Orden de Servicio» (FD-DCU-02, Vista Lógica §7.8 MVC).
 * Reglas:
 *  RN-TAL-01  N.° ORD-AAAA-XXXX correlativo y único anual (lo genera la BD).
 *  RN-TAL-02  Una moto (placa) no puede tener más de una orden activa: Recepcionado o En Proceso.
 *  RN-TAL-03  Obligatorios: cliente, teléfono, placa, tipo de servicio y descripción.
 *             Opcionales: color y modelo.
 */
export enum TipoServicio {
  MANTENIMIENTO = 'MANTENIMIENTO',
  REPARACION = 'REPARACION',
}

/** RN-TAL-02 */
export const ESTADOS_ORDEN_ACTIVA = [EstadoOrden.RECEPCIONADO, EstadoOrden.EN_PROCESO];

export interface DatosRecepcion {
  nombresCliente: string;
  telefono: string;
  /** Opcional: DNI (8 dígitos) o RUC (11). INT-001 no lo pide; sirve para reconocer al cliente. */
  documento: { tipo: 'DNI' | 'RUC'; numero: string } | null;
  placa: string;
  color: string | null;
  modelo: string | null;
  tipoServicio: TipoServicio;
  descripcion: string;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v == null ? '' : String(v).trim());

/**
 * Teléfono peruano: celular de 9 dígitos que empieza con 9, fijo con código de
 * ciudad (0 + 8 dígitos, p. ej. 054223344) o fijo local de 6-7 dígitos.
 * Se admiten espacios, guiones y el prefijo +51. (Formato pendiente de confirmar en el catálogo.)
 */
export function normalizarTelefono(valor: string): string | null {
  const digitos = valor.replace(/[\s-]/g, '').replace(/^\+?51(?=9\d{8}$)/, '');
  return /^(9\d{8}|0\d{8}|\d{6,7})$/.test(digitos) ? digitos : null;
}

/**
 * Placa: letras y números en mayúsculas, con o sin guion (p. ej. 1234-AB, A1-2345),
 * entre 5 y 8 caracteres, con al menos una letra y un número.
 * (Formato pendiente de confirmar en el catálogo.)
 */
export function normalizarPlaca(valor: string): string | null {
  const placa = valor.toUpperCase().replace(/\s/g, '');
  const sinGuion = placa.replace(/-/g, '');
  const valida =
    /^[A-Z0-9]+(-[A-Z0-9]+)?$/.test(placa) &&
    sinGuion.length >= 5 &&
    sinGuion.length <= 8 &&
    /[A-Z]/.test(sinGuion) &&
    /\d/.test(sinGuion);
  return valida ? placa : null;
}

const opcional = (v: unknown, max: number) => {
  const t = texto(v);
  return t ? t.slice(0, max) : null;
};

/** Paso 6 de CU-TAL-01: obligatoriedad y formato. Lanza el MSG correspondiente (6.a). */
export function validarDatosRecepcion(e: Record<string, unknown>): DatosRecepcion {
  const { nombresCliente, telefono } = validarContacto(e);

  const placaTexto = texto(e.placa);
  if (!placaTexto) throw new ErrorDominio('MSG-25', 'Ingrese la placa de la motocicleta.', 'placa');
  const placa = normalizarPlaca(placaTexto);
  if (!placa) throw new ErrorDominio('MSG-25', 'Placa inválida (ejemplo: 1234-AB).', 'placa');

  const { tipoServicio, descripcion } = validarServicio(e);

  let documento: DatosRecepcion['documento'] = null;
  const documentoTexto = texto(e.documento).replace(/\s/g, '');
  if (documentoTexto) {
    if (/^\d{8}$/.test(documentoTexto)) documento = { tipo: 'DNI', numero: documentoTexto };
    else if (/^\d{11}$/.test(documentoTexto)) documento = { tipo: 'RUC', numero: documentoTexto };
    else throw new ErrorDominio('VAL-DOCUMENTO', 'El documento debe ser un DNI (8 dígitos) o RUC (11 dígitos).', 'documento');
  }

  return {
    nombresCliente,
    telefono,
    documento,
    placa,
    color: opcional(e.color, 30),
    modelo: opcional(e.modelo, 50),
    tipoServicio,
    descripcion,
  };
}

/** Campos editables de la orden en CU-TAL-03 (INP-01, INP-02, INP-04, INP-05, SEL-01, INP-06). */
export interface DatosEditablesOrden {
  nombresCliente: string;
  telefono: string;
  color: string | null;
  modelo: string | null;
  tipoServicio: TipoServicio;
  descripcion: string;
}

/** CU-TAL-03 paso 6 / flujo 6.b: mismas reglas de obligatoriedad que la recepción (MSG-23 a MSG-29). */
export function validarDatosEditables(e: Record<string, unknown>): DatosEditablesOrden {
  const contacto = validarContacto(e);
  const servicio = validarServicio(e);
  return { ...contacto, color: opcional(e.color, 30), modelo: opcional(e.modelo, 50), ...servicio };
}

function validarServicio(e: Record<string, unknown>): { tipoServicio: TipoServicio; descripcion: string } {
  const tipoServicio = texto(e.tipoServicio);
  if (!(Object.values(TipoServicio) as string[]).includes(tipoServicio)) {
    throw new ErrorDominio('MSG-28', 'Seleccione el tipo de servicio.', 'tipoServicio');
  }
  const descripcion = texto(e.descripcion);
  if (!descripcion) throw new ErrorDominio('MSG-29', 'Ingrese la descripción del servicio.', 'descripcion');
  if (descripcion.length > 500) {
    throw new ErrorDominio('MSG-29', 'La descripción no puede superar 500 caracteres.', 'descripcion');
  }
  return { tipoServicio: tipoServicio as TipoServicio, descripcion };
}

function validarContacto(e: Record<string, unknown>): { nombresCliente: string; telefono: string } {
  const nombresCliente = texto(e.nombresCliente);
  if (!nombresCliente) throw new ErrorDominio('MSG-23', 'Ingrese los nombres del cliente.', 'nombresCliente');
  if (nombresCliente.length > 150) {
    throw new ErrorDominio('MSG-23', 'Los nombres del cliente no pueden superar 150 caracteres.', 'nombresCliente');
  }

  const telefonoTexto = texto(e.telefono);
  if (!telefonoTexto) throw new ErrorDominio('MSG-24', 'Ingrese el teléfono del cliente.', 'telefono');
  const telefono = normalizarTelefono(telefonoTexto);
  if (!telefono) {
    throw new ErrorDominio('MSG-24', 'Teléfono inválido: use un celular de 9 dígitos o un teléfono fijo.', 'telefono');
  }
  return { nombresCliente, telefono };
}
