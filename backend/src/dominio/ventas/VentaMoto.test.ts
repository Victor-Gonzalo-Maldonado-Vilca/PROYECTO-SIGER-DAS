import { describe, expect, it } from 'vitest';
import { EstadoVenta, motivoNoAsociable, validarPrecioVenta, type ClienteComprador } from './VentaMoto';

describe('Precio de venta de la moto (adición al catálogo para ILA-0018)', () => {
  it.each([
    ['5490', 5490],
    ['5490.5', 5490.5],
    ['5 490,50'.replace(' ', ''), 5490.5],
    [8490.99, 8490.99],
  ])('acepta %s', (entrada, esperado) => expect(validarPrecioVenta(entrada)).toBe(esperado));

  it.each([
    ['', 'MSG-45'],
    [undefined, 'MSG-45'],
    ['0', 'VAL-PRECIO'],
    ['-100', 'VAL-PRECIO'],
    ['abc', 'VAL-PRECIO'],
    ['5490.555', 'VAL-PRECIO'],
    ['999999', 'VAL-PRECIO'],
  ])('rechaza %s con %s', (entrada, codigo) => {
    expect(() => validarPrecioVenta(entrada)).toThrow(expect.objectContaining({ codigo, campo: 'precio' }));
  });
});

const cliente: ClienteComprador = {
  id: 1,
  nombre: 'Ana Quispe',
  tipoDocumento: 'DNI',
  numeroDocumento: '45678912',
  estado: 'ACTIVO',
};

describe('ILA-0017 / CU-VEN-10: reglas de asociación', () => {
  it('permite asociar un cliente fiscal activo a una venta SIN_CLIENTE', () => {
    expect(motivoNoAsociable(EstadoVenta.SIN_CLIENTE, cliente)).toBeNull();
    expect(motivoNoAsociable(EstadoVenta.SIN_CLIENTE, { ...cliente, tipoDocumento: 'RUC' })).toBeNull();
  });

  it.each([
    ['venta con cliente', EstadoVenta.CON_CLIENTE, {}, /ya tiene un cliente/],
    ['venta facturada', EstadoVenta.COMPROBANTE_EMITIDO, {}, /comprobante emitido/],
    ['cliente sin documento', EstadoVenta.SIN_CLIENTE, { tipoDocumento: null, numeroDocumento: null }, /DNI ni RUC/],
    ['cliente inactivo', EstadoVenta.SIN_CLIENTE, { estado: 'INACTIVO' as const }, /dado de baja/],
  ])('rechaza: %s', (_caso, estado, cambios, motivo) => {
    expect(motivoNoAsociable(estado, { ...cliente, ...cambios })).toMatch(motivo);
  });
});
