import { ErrorConflicto, ErrorDominio } from '../compartido/errores';
import { normalizarTelefono } from '../ordenes/RecepcionOrden';

/**
 * MOD-05 Clientes (EDU-0020, ILA-0079 a ILA-0082; fichas CU-CLI-01 a CU-CLI-05).
 * Vista Lógica, Fig. 7: Cliente se especializa en PersonaNatural (DNI de 8 dígitos)
 * y PersonaJuridica (RUC de 11 dígitos). El documento es único (RN-CLI-01).
 *
 * Nota: la ficha CU-CLI-01 menciona también CE y Pasaporte, pero la Vista Lógica
 * (más reciente) y Tab_cliente solo admiten DNI y RUC. Se sigue la Vista Lógica.
 */

export type TipoDocumento = 'DNI' | 'RUC';
export type EstadoCliente = 'ACTIVO' | 'INACTIVO';

export interface DatosCliente {
  tipoDocumento: TipoDocumento | null;
  numeroDocumento: string | null;
  /** Nombres y apellidos (persona natural) o razón social (persona jurídica). */
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
}

export interface Cliente extends DatosCliente {
  id: number;
  estado: EstadoCliente;
  version: number;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Paso 5 de CU-CLI-01 y CU-CLI-03: obligatoriedad y formato.
 * @param documentoObligatorio en el registro (CU-CLI-01) el documento es obligatorio;
 *   en la edición solo lo es si el cliente ya tenía uno (no se puede borrar).
 */
export function validarDatosCliente(entrada: Record<string, unknown>, documentoObligatorio: boolean): DatosCliente {
  const tipo = texto(entrada.tipoDocumento).toUpperCase();
  const numero = texto(entrada.numeroDocumento).replace(/\s/g, '');
  const nombre = texto(entrada.nombre).replace(/\s+/g, ' ');
  const telefono = texto(entrada.telefono);
  const correo = texto(entrada.correo).toLowerCase();
  const direccion = texto(entrada.direccion).replace(/\s+/g, ' ');

  let tipoDocumento: TipoDocumento | null = null;
  let numeroDocumento: string | null = null;
  if (numero || tipo || documentoObligatorio) {
    if (tipo !== 'DNI' && tipo !== 'RUC') {
      throw new ErrorDominio('VAL-CLIENTE', 'Seleccione el tipo de documento (DNI o RUC).', 'tipoDocumento');
    }
    if (!numero) {
      throw new ErrorDominio('VAL-CLIENTE', 'Ingrese el número de documento.', 'numeroDocumento');
    }
    if (tipo === 'DNI' && !/^\d{8}$/.test(numero)) {
      throw new ErrorDominio('VAL-CLIENTE', 'El DNI debe tener 8 dígitos.', 'numeroDocumento');
    }
    if (tipo === 'RUC' && !/^(10|15|17|20)\d{9}$/.test(numero)) {
      throw new ErrorDominio(
        'VAL-CLIENTE',
        'El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.',
        'numeroDocumento',
      );
    }
    tipoDocumento = tipo;
    numeroDocumento = numero;
  }

  if (!nombre) {
    const etiqueta = tipoDocumento === 'RUC' ? 'la razón social' : 'los nombres y apellidos';
    throw new ErrorDominio('VAL-CLIENTE', `Ingrese ${etiqueta} del cliente.`, 'nombre');
  }
  if (nombre.length > 150) {
    throw new ErrorDominio('VAL-CLIENTE', 'El nombre o razón social admite como máximo 150 caracteres.', 'nombre');
  }

  let telefonoNormalizado: string | null = null;
  if (telefono) {
    telefonoNormalizado = normalizarTelefono(telefono);
    if (!telefonoNormalizado) {
      throw new ErrorDominio(
        'VAL-CLIENTE',
        'Teléfono inválido: celular de 9 dígitos (9XXXXXXXX) o fijo de 6 a 9 dígitos.',
        'telefono',
      );
    }
  }

  if (correo && (correo.length > 100 || !CORREO.test(correo))) {
    throw new ErrorDominio('VAL-CLIENTE', 'Correo electrónico inválido.', 'correo');
  }
  if (direccion.length > 200) {
    throw new ErrorDominio('VAL-CLIENTE', 'La dirección admite como máximo 200 caracteres.', 'direccion');
  }

  return {
    tipoDocumento,
    numeroDocumento,
    nombre,
    telefono: telefonoNormalizado,
    correo: correo || null,
    direccion: direccion || null,
  };
}

/** Error MSG-102 (RN-CLI-01 / RN-CLI-04). */
export const errorDocumentoDuplicado = () =>
  new ErrorConflicto('MSG-102', 'El número de documento ingresado ya se encuentra registrado', 'numeroDocumento');
