import { describe, expect, it } from 'vitest';
import { EstadoVenta, motivoNoAsociable, type ClienteComprador } from './VentaMoto';

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
