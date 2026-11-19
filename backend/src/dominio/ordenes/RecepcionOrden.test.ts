import { describe, expect, it } from 'vitest';
import { normalizarPlaca, normalizarTelefono, validarDatosRecepcion } from './RecepcionOrden';

const validos = {
  nombresCliente: '  Luis   Condori ',
  telefono: '959 123 456',
  placa: '1234-ab',
  color: '',
  modelo: 'XR150L',
  tipoServicio: 'MANTENIMIENTO',
  descripcion: 'Cambio de aceite',
};

describe('ILA-0001: validación de INT-001 (RN-TAL-03)', () => {
  it('normaliza los datos válidos; color y modelo son opcionales', () => {
    expect(validarDatosRecepcion(validos)).toEqual({
      nombresCliente: 'Luis Condori',
      telefono: '959123456',
      documento: null,
      placa: '1234-AB',
      color: null,
      modelo: 'XR150L',
      tipoServicio: 'MANTENIMIENTO',
      descripcion: 'Cambio de aceite',
    });
  });

  it.each([
    ['nombresCliente', '', 'MSG-23'],
    ['telefono', '', 'MSG-24'],
    ['telefono', '12345', 'MSG-24'],
    ['placa', '', 'MSG-25'],
    ['placa', 'ABCDEF', 'MSG-25'],
    ['tipoServicio', '', 'MSG-28'],
    ['tipoServicio', 'LAVADO', 'MSG-28'],
    ['descripcion', '   ', 'MSG-29'],
    ['documento', '123', 'VAL-DOCUMENTO'],
  ])('%s = "%s" -> %s', (campo, valor, codigo) => {
    expect(() => validarDatosRecepcion({ ...validos, [campo]: valor })).toThrow(
      expect.objectContaining({ codigo, campo }),
    );
  });

  it('reconoce DNI y RUC opcionales', () => {
    expect(validarDatosRecepcion({ ...validos, documento: '45678912' }).documento).toEqual({ tipo: 'DNI', numero: '45678912' });
    expect(validarDatosRecepcion({ ...validos, documento: '20456789123' }).documento).toEqual({
      tipo: 'RUC',
      numero: '20456789123',
    });
  });

  it.each([
    ['959123456', '959123456'],
    ['+51 959 123 456', '959123456'],
    ['054-223344', '054223344'],
    ['223344', '223344'],
    ['859123456', null],
    ['95912345', null],
  ])('teléfono %s -> %s', (entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado);
  });

  it.each([
    ['1234-ab', '1234-AB'],
    ['A1-2345', 'A1-2345'],
    ['1234AB', '1234AB'],
    ['12-34-AB', null],
    ['ABCDE', null],
    ['1234', null],
  ])('placa %s -> %s', (entrada, esperado) => {
    expect(normalizarPlaca(entrada)).toBe(esperado);
  });
});
