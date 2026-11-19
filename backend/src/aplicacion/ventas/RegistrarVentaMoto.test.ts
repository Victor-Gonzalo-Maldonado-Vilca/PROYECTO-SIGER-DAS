import { beforeEach, describe, expect, it } from 'vitest';
import type { EntradaAuditoria } from '../../dominio/auditoria/RepositorioAuditoria';
import { ErrorAutorizacion, ErrorConflicto, ErrorDominio } from '../../dominio/compartido/errores';
import { Modulos, Rol, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { Moto } from '../../dominio/ventas/Moto';
import type { RepositoriosTransaccionales, UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { RegistrarVentaMoto } from './RegistrarVentaMoto';

/**
 * Pruebas del caso de uso ILA-0012 SIN base de datos.
 * La unidad de trabajo falsa imita BEGIN/COMMIT/ROLLBACK: trabaja sobre una
 * copia de los datos y solo la confirma si el trabajo termina sin error.
 */
class BaseFalsa {
  motos: Array<{ id: number; numeroMotor: string; numeroChasis: string }> = [];
  ventas: Array<{ id: number; motoId: number }> = [];
  auditoria: EntradaAuditoria[] = [];
  fallarAlGuardarVenta = false;
}

class UnidadDeTrabajoFalsa implements UnidadDeTrabajo {
  constructor(private readonly bd: BaseFalsa) {}

  async ejecutar<T>(trabajo: (repos: RepositoriosTransaccionales) => Promise<T>): Promise<T> {
    // "BEGIN": copia de trabajo
    const tx = { motos: [...this.bd.motos], ventas: [...this.bd.ventas], auditoria: [...this.bd.auditoria] };
    const bd = this.bd;
    const resultado = await trabajo({
      motos: {
        existeNumeroMotor: async (n) => tx.motos.some((m) => m.numeroMotor === n),
        existeNumeroChasis: async (n) => tx.motos.some((m) => m.numeroChasis === n),
        guardar: async (moto: Moto) => {
          const id = tx.motos.length + 1;
          tx.motos.push({ id, numeroMotor: moto.datos.numeroMotor, numeroChasis: moto.datos.numeroChasis });
          return id;
        },
      },
      ventasMoto: {
        guardar: async (_venta, motoId) => {
          if (bd.fallarAlGuardarVenta) throw new Error('Conexión perdida');
          const id = tx.ventas.length + 1;
          tx.ventas.push({ id, motoId });
          return { id, nroVenta: `VM-2026-${String(id).padStart(4, '0')}`, fecha: new Date() };
        },
      },
      auditoria: { registrar: async (e) => void tx.auditoria.push(e) },
    });
    // "COMMIT": solo si no hubo excepción
    Object.assign(this.bd, tx);
    return resultado;
  }
}

const vendedor: UsuarioAutenticado = {
  id: 2,
  usuario: 'vendedor',
  nombreCompleto: 'Vendedor',
  rol: Rol.VENDEDOR,
  modulos: [Modulos.VENTAS],
};

const datosValidos = {
  marca: 'Honda',
  modelo: 'CB190R',
  anio: 2026,
  color: 'Rojo',
  numeroMotor: 'mot-001',
  numeroChasis: 'CHS-001',
};

describe('ILA-0012 Registrar venta de moto', () => {
  let bd: BaseFalsa;
  let casoDeUso: RegistrarVentaMoto;

  beforeEach(() => {
    bd = new BaseFalsa();
    casoDeUso = new RegistrarVentaMoto(new UnidadDeTrabajoFalsa(bd));
  });

  it('registra moto, venta y auditoría juntas y responde MSG-48', async () => {
    const r = await casoDeUso.ejecutar(datosValidos, vendedor);

    expect(r.codigo).toBe('MSG-48');
    expect(bd.motos).toHaveLength(1);
    expect(bd.motos[0].numeroMotor).toBe('MOT-001'); // normalizado en mayúsculas
    expect(bd.ventas).toEqual([{ id: 1, motoId: 1 }]);
    expect(bd.auditoria[0]).toMatchObject({ usuarioId: 2, accion: 'REGISTRAR_VENTA_MOTO' });
  });

  it('MSG-45 si falta un campo obligatorio y no registra nada', async () => {
    await expect(casoDeUso.ejecutar({ ...datosValidos, color: '  ' }, vendedor)).rejects.toMatchObject({
      codigo: 'MSG-45',
      campo: 'color',
    });
    expect(bd.motos).toHaveLength(0);
  });

  it('MSG-46 si el N.° de motor ya existe (sin importar mayúsculas)', async () => {
    await casoDeUso.ejecutar(datosValidos, vendedor);
    const error = await casoDeUso
      .ejecutar({ ...datosValidos, numeroMotor: 'MOT-001', numeroChasis: 'CHS-999' }, vendedor)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ErrorConflicto);
    expect(error.codigo).toBe('MSG-46');
    expect(bd.motos).toHaveLength(1);
  });

  it('MSG-47 si el N.° de chasis ya existe', async () => {
    await casoDeUso.ejecutar(datosValidos, vendedor);
    await expect(
      casoDeUso.ejecutar({ ...datosValidos, numeroMotor: 'MOT-999' }, vendedor),
    ).rejects.toMatchObject({ codigo: 'MSG-47' });
  });

  it('RNF-0004: si falla el INSERT de la venta, se revierte también la moto (sin huérfanos)', async () => {
    bd.fallarAlGuardarVenta = true;
    await expect(casoDeUso.ejecutar(datosValidos, vendedor)).rejects.toThrow('Conexión perdida');
    expect(bd.motos).toHaveLength(0);
    expect(bd.ventas).toHaveLength(0);
    expect(bd.auditoria).toHaveLength(0);
  });

  it('RNF-0005: rechaza a un perfil sin MOD-04 aunque la ruta no lo haya filtrado', async () => {
    const mecanico = { ...vendedor, rol: Rol.MECANICO, modulos: [Modulos.ORDENES_SERVICIO] };
    await expect(casoDeUso.ejecutar(datosValidos, mecanico)).rejects.toBeInstanceOf(ErrorAutorizacion);
    await expect(casoDeUso.ejecutar(datosValidos, undefined)).rejects.toBeInstanceOf(ErrorAutorizacion);
  });

  it('valida que el año sea un entero razonable', async () => {
    await expect(casoDeUso.ejecutar({ ...datosValidos, anio: 'abc' }, vendedor)).rejects.toBeInstanceOf(
      ErrorDominio,
    );
  });
});
