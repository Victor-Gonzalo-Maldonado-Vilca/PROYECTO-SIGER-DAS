import { describe, expect, it } from 'vitest';
import { EstadoOrden as E, esEditable, esTransicionPermitida } from './OrdenServicio';

describe('CU-TAL-03: máquina de estados de la orden (RN-TAL-05 / RN-TAL-06)', () => {
  it.each([
    [E.RECEPCIONADO, E.EN_PROCESO],
    [E.RECEPCIONADO, E.CANCELADO],
    [E.EN_PROCESO, E.POR_ENTREGAR],
    [E.EN_PROCESO, E.EN_PROCESO], // solo se editan datos
  ])('permite %s -> %s', (a, b) => expect(esTransicionPermitida(a, b)).toBe(true));

  it.each([
    [E.RECEPCIONADO, E.FINALIZADO],
    [E.EN_PROCESO, E.FINALIZADO], // lo hace la conformidad (ILA-0075)
    [E.FINALIZADO, E.ENTREGADO], // lo hace el comprobante (ILA-0018)
    [E.EN_PROCESO, E.RECEPCIONADO],
    [E.POR_ENTREGAR, E.EN_PROCESO],
    [E.CANCELADO, E.RECEPCIONADO],
  ])('rechaza %s -> %s', (a, b) => expect(esTransicionPermitida(a, b)).toBe(false));

  it('ENTREGADO y CANCELADO no son editables', () => {
    expect(esEditable(E.ENTREGADO)).toBe(false);
    expect(esEditable(E.CANCELADO)).toBe(false);
    expect(esEditable(E.FINALIZADO)).toBe(true);
  });
});
