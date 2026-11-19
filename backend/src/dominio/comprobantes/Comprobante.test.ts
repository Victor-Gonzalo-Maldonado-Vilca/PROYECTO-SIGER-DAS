import { describe, expect, it } from 'vitest';
import { calcularTotales, claveIdempotencia, formatearNumero, TipoComprobante } from './Comprobante';
import { motivoNoEmitibleComoBoleta, TipoTransaccion, type TransaccionFacturable } from './TransaccionFacturable';

describe('Comprobante', () => {
  it.each([118, 145, 95, 5490, 0.01, 33.33])('subtotal + IGV = total exacto (%s)', (total) => {
    const t = calcularTotales(total);
    expect(t.total).toBe(total);
    expect(Math.round((t.subtotal + t.igv) * 100) / 100).toBe(total);
  });

  it('separa el IGV del 18 % de un precio que lo incluye', () => {
    expect(calcularTotales(118)).toEqual({ subtotal: 100, igv: 18, total: 118 });
  });

  it('formatea el número y arma la clave estable', () => {
    expect(formatearNumero('B001', 7)).toBe('B001-00000007');
    expect(claveIdempotencia('20000000001', TipoComprobante.BOLETA, 'B001', 7)).toBe('20000000001-03-B001-7');
  });
});

describe('TransaccionFacturable: reglas de boleta', () => {
  const base: TransaccionFacturable = {
    tipo: TipoTransaccion.VENTA_MOTO,
    id: 1,
    referencia: 'VM-2026-0001',
    fecha: new Date(),
    cliente: { id: 1, tipoDocumento: 'DNI', numeroDocumento: '12345678', nombre: 'Ana' },
    items: [{ descripcion: 'Moto', cantidad: 1, importe: 100 }],
    total: 100,
    listaParaComprobante: true,
    tieneComprobante: false,
  };

  it('acepta persona natural lista y sin comprobante', () => {
    expect(motivoNoEmitibleComoBoleta(base)).toBeNull();
  });

  it.each([
    ['ya tiene comprobante', { tieneComprobante: true }, /ya tiene/],
    ['no está lista', { listaParaComprobante: false }, /no está lista/],
    ['sin cliente', { cliente: null }, /no tiene cliente/],
    ['persona jurídica', { cliente: { ...base.cliente!, tipoDocumento: 'RUC' as const } }, /factura/],
    ['monto cero', { total: 0 }, /monto/],
  ])('rechaza: %s', (_c, cambios, motivo) => {
    expect(motivoNoEmitibleComoBoleta({ ...base, ...cambios })).toMatch(motivo);
  });
});
