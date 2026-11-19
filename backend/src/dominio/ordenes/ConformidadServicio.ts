import { ErrorDominio } from '../compartido/errores';

/**
 * Entidad ConformidadServicio (Vista Lógica, MOD-02, Fig. 4).
 * Documenta el trabajo realizado, los insumos, el kilometraje, el precio total
 * y la firma de conformidad del cliente capturada en PAD-01.
 */

/** MSG-05 «Error en el registro de conformidad» (indica el motivo). */
export function errorConformidad(motivo: string, campo?: string): ErrorDominio {
  return new ErrorDominio('MSG-05', `Error en el registro de conformidad: ${motivo}`, campo);
}

const FIRMA_PNG_CABECERA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIRMA_TAMANO_MAXIMO = 500 * 1024; // 500 KB

export interface EntradaConformidad {
  ordenId: number;
  kilometraje: number;
  firmaPng: Buffer;
}

/**
 * Paso 8 de ILA-0075: ¿hay orden seleccionada, datos íntegros y trazo de PAD-01 no vacío?
 * La firma llega como data URL «data:image/png;base64,...».
 * (Que el trazo no esté vacío lo controla también la interfaz, que solo envía la
 * firma si el usuario dibujó en el panel.)
 */
export function validarEntradaConformidad(entrada: {
  ordenId?: unknown;
  kilometraje?: unknown;
  firma?: unknown;
}): EntradaConformidad {
  const ordenId = Number(entrada.ordenId);
  if (!Number.isInteger(ordenId) || ordenId <= 0) {
    throw errorConformidad('seleccione una orden de servicio', 'ordenId');
  }

  if (entrada.kilometraje === undefined || entrada.kilometraje === null || entrada.kilometraje === '') {
    throw errorConformidad('ingrese el kilometraje', 'kilometraje');
  }
  const kilometraje = Number(entrada.kilometraje);
  if (!Number.isInteger(kilometraje) || kilometraje < 0) {
    throw errorConformidad('el kilometraje debe ser un número entero mayor o igual a 0', 'kilometraje');
  }

  const prefijo = 'data:image/png;base64,';
  if (typeof entrada.firma !== 'string' || !entrada.firma.startsWith(prefijo)) {
    throw errorConformidad('falta la firma del cliente en PAD-01', 'firma');
  }
  const firmaPng = Buffer.from(entrada.firma.slice(prefijo.length), 'base64');
  if (firmaPng.length <= FIRMA_PNG_CABECERA.length || !firmaPng.subarray(0, 8).equals(FIRMA_PNG_CABECERA)) {
    throw errorConformidad('la firma capturada no es válida', 'firma');
  }
  if (firmaPng.length > FIRMA_TAMANO_MAXIMO) {
    throw errorConformidad('la imagen de la firma supera los 500 KB', 'firma');
  }

  return { ordenId, kilometraje, firmaPng };
}
