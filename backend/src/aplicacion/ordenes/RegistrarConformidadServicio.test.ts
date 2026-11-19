import { beforeEach, describe, expect, it } from 'vitest';
import { ErrorAutorizacion, ErrorConflicto } from '../../dominio/compartido/errores';
import { EstadoOrden, type OrdenParaConformidad } from '../../dominio/ordenes/OrdenServicio';
import type { NuevaConformidad } from '../../dominio/ordenes/repositorios';
import { Modulos, Rol, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { RepositoriosTransaccionales, UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { RegistrarConformidadServicio } from './RegistrarConformidadServicio';

/** PNG mínimo válido (1x1) como data URL, para simular la firma de PAD-01. */
const FIRMA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

interface Estado {
  orden: OrdenParaConformidad;
  conformidades: NuevaConformidad[];
  historial: Array<{ anterior: EstadoOrden; nuevo: EstadoOrden }>;
  fallarHistorial: boolean;
}

/** UoW falsa: aplica los cambios solo si el trabajo termina sin error (imita COMMIT/ROLLBACK). */
class UoWFalsa implements UnidadDeTrabajo {
  constructor(private readonly bd: Estado) {}

  async ejecutar<T>(trabajo: (r: RepositoriosTransaccionales) => Promise<T>): Promise<T> {
    const tx: Estado = structuredClone(this.bd);
    const resultado = await trabajo({
      ordenes: {
        bloquearParaConformidad: async (id) => (id === tx.orden.id ? tx.orden : null),
        itemsDeProforma: async () => [
          { tipoItem: 'SERVICIO', descripcion: 'Mano de obra', cantidad: 1, subtotal: 60 },
          { tipoItem: 'REPUESTO', descripcion: 'Pastillas de freno', cantidad: 2, subtotal: 50 },
        ],
        cambiarEstado: async (_id, nuevo) => void (tx.orden.estado = nuevo),
      },
      conformidades: {
        guardar: async (c) => {
          tx.conformidades.push(c);
          tx.orden.tieneConformidad = true;
          return { id: tx.conformidades.length, nroConformidad: 'CS-2026-0001', fechaEmision: new Date() };
        },
      },
      historialOrden: {
        registrar: async (e) => {
          if (this.bd.fallarHistorial) throw new Error('Conexión perdida');
          tx.historial.push(e);
        },
      },
      auditoria: { registrar: async () => {} },
      motos: {} as RepositoriosTransaccionales['motos'],
      ventasMoto: {} as RepositoriosTransaccionales['ventasMoto'],
    });
    Object.assign(this.bd, tx);
    return resultado;
  }
}

const gerente: UsuarioAutenticado = {
  id: 1,
  usuario: 'gerente',
  nombreCompleto: 'Gerente',
  rol: Rol.GERENTE,
  modulos: [Modulos.ORDENES_SERVICIO],
};

const ordenApta = (): OrdenParaConformidad => ({
  id: 10,
  nroOrden: 'ORD-2026-0010',
  estado: EstadoOrden.EN_PROCESO,
  proformaId: 5,
  estadoProforma: 'APROBADA',
  totalProforma: 110,
  tieneConformidad: false,
});

describe('ILA-0075 Registro de conformidad de servicio', () => {
  let bd: Estado;
  let casoDeUso: RegistrarConformidadServicio;

  beforeEach(() => {
    bd = { orden: ordenApta(), conformidades: [], historial: [], fallarHistorial: false };
    casoDeUso = new RegistrarConformidadServicio(new UoWFalsa(bd));
  });

  it('registra la conformidad, finaliza la orden y responde LBL-01', async () => {
    const r = await casoDeUso.ejecutar({ ordenId: 10, kilometraje: 12500, firma: FIRMA }, gerente);

    expect(r.codigo).toBe('LBL-01');
    expect(bd.orden.estado).toBe(EstadoOrden.FINALIZADO);
    expect(bd.historial).toEqual([
      expect.objectContaining({ anterior: EstadoOrden.EN_PROCESO, nuevo: EstadoOrden.FINALIZADO }),
    ]);
    expect(bd.conformidades[0]).toMatchObject({
      kilometraje: 12500,
      precioTotal: 110,
      trabajosRealizados: 'Mano de obra',
      insumosEmpleados: 'Pastillas de freno x2',
    });
  });

  it('acepta órdenes POR_ENTREGAR', async () => {
    bd.orden.estado = EstadoOrden.POR_ENTREGAR;
    await casoDeUso.ejecutar({ ordenId: 10, kilometraje: 0, firma: FIRMA }, gerente);
    expect(bd.orden.estado).toBe(EstadoOrden.FINALIZADO);
  });

  it.each([
    [{ kilometraje: 100, firma: FIRMA }, 'ordenId'],
    [{ ordenId: 10, firma: FIRMA }, 'kilometraje'],
    [{ ordenId: 10, kilometraje: -5, firma: FIRMA }, 'kilometraje'],
    [{ ordenId: 10, kilometraje: 100 }, 'firma'],
    [{ ordenId: 10, kilometraje: 100, firma: 'data:image/png;base64,AAAA' }, 'firma'],
  ])('MSG-05 si faltan datos o la firma está vacía (%#)', async (entrada, campo) => {
    await expect(casoDeUso.ejecutar(entrada, gerente)).rejects.toMatchObject({ codigo: 'MSG-05', campo });
    expect(bd.orden.estado).toBe(EstadoOrden.EN_PROCESO);
  });

  it.each([
    ['estado RECEPCIONADO', { estado: EstadoOrden.RECEPCIONADO }],
    ['estado ENTREGADO', { estado: EstadoOrden.ENTREGADO }],
    ['proforma pendiente', { estadoProforma: 'PENDIENTE' }],
    ['sin proforma', { proformaId: null, estadoProforma: null }],
  ])('MSG-05 si la orden no es apta: %s', async (_caso, cambios) => {
    Object.assign(bd.orden, cambios);
    await expect(
      casoDeUso.ejecutar({ ordenId: 10, kilometraje: 100, firma: FIRMA }, gerente),
    ).rejects.toMatchObject({ codigo: 'MSG-05' });
    expect(bd.conformidades).toHaveLength(0);
  });

  it('MSG-05 (conflicto) si la orden ya tiene conformidad', async () => {
    await casoDeUso.ejecutar({ ordenId: 10, kilometraje: 100, firma: FIRMA }, gerente);
    bd.orden.estado = EstadoOrden.EN_PROCESO; // aunque volviera a un estado apto
    const error = await casoDeUso
      .ejecutar({ ordenId: 10, kilometraje: 100, firma: FIRMA }, gerente)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ErrorConflicto);
    expect(bd.conformidades).toHaveLength(1);
  });

  it('RNF-0004: si falla un paso posterior al INSERT, la orden conserva su estado anterior', async () => {
    bd.fallarHistorial = true;
    await expect(casoDeUso.ejecutar({ ordenId: 10, kilometraje: 100, firma: FIRMA }, gerente)).rejects.toThrow(
      'Conexión perdida',
    );
    expect(bd.conformidades).toHaveLength(0);
    expect(bd.orden.estado).toBe(EstadoOrden.EN_PROCESO);
  });

  it('rechaza perfiles sin MOD-02', async () => {
    const vendedor = { ...gerente, rol: Rol.VENDEDOR, modulos: [Modulos.VENTAS] };
    await expect(
      casoDeUso.ejecutar({ ordenId: 10, kilometraje: 1, firma: FIRMA }, vendedor),
    ).rejects.toBeInstanceOf(ErrorAutorizacion);
  });
});
