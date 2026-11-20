import { describe, expect, it } from 'vitest';
import { ErrorDominio } from '../compartido/errores';
import { validarDatosCliente } from './Cliente';

const base = { tipoDocumento: 'DNI', numeroDocumento: '45678912', nombre: 'Carlos Pérez Quispe' };

const campoInvalido = (entrada: Record<string, unknown>, obligatorio = true) => {
  try {
    validarDatosCliente(entrada, obligatorio);
  } catch (e) {
    if (e instanceof ErrorDominio) return e.campo;
    throw e;
  }
  return null;
};

describe('validarDatosCliente (CU-CLI-01 paso 5)', () => {
  it('normaliza los datos válidos', () => {
    const d = validarDatosCliente(
      { ...base, nombre: '  Carlos   Pérez ', telefono: '959 111 222', correo: ' Carlos@Mail.COM ', direccion: '' },
      true,
    );
    expect(d).toEqual({
      tipoDocumento: 'DNI',
      numeroDocumento: '45678912',
      nombre: 'Carlos Pérez',
      telefono: '959111222',
      correo: 'carlos@mail.com',
      direccion: null,
    });
  });

  it('exige el documento en el registro', () => {
    expect(campoInvalido({ ...base, numeroDocumento: '' })).toBe('numeroDocumento');
    expect(campoInvalido({ ...base, tipoDocumento: 'CE' })).toBe('tipoDocumento');
  });

  it('valida la longitud del DNI y el RUC', () => {
    expect(campoInvalido({ ...base, numeroDocumento: '1234567' })).toBe('numeroDocumento');
    expect(campoInvalido({ ...base, tipoDocumento: 'RUC', numeroDocumento: '45678912' })).toBe('numeroDocumento');
    expect(campoInvalido({ ...base, tipoDocumento: 'RUC', numeroDocumento: '30456789123' })).toBe('numeroDocumento');
    expect(campoInvalido({ ...base, tipoDocumento: 'RUC', numeroDocumento: '20456789123' })).toBeNull();
  });

  it('exige nombre y valida teléfono y correo', () => {
    expect(campoInvalido({ ...base, nombre: '   ' })).toBe('nombre');
    expect(campoInvalido({ ...base, telefono: '12' })).toBe('telefono');
    expect(campoInvalido({ ...base, correo: 'sin-arroba' })).toBe('correo');
  });

  it('en la edición permite seguir sin documento si nunca lo tuvo', () => {
    const d = validarDatosCliente({ tipoDocumento: '', numeroDocumento: '', nombre: 'Juan' }, false);
    expect(d.tipoDocumento).toBeNull();
    expect(d.numeroDocumento).toBeNull();
    // pero si escribe un número, debe ser válido
    expect(campoInvalido({ tipoDocumento: 'DNI', numeroDocumento: '123', nombre: 'Juan' }, false)).toBe(
      'numeroDocumento',
    );
  });
});
