import type { Moto } from './Moto';
import type { EstadoVenta, VentaMoto } from './VentaMoto';

/**
 * Contratos (puertos) que el núcleo necesita. Se implementan en acceso_datos/.
 * El dominio no depende de TypeORM ni de PostgreSQL (Clean Architecture).
 */
export interface RepositorioMotos {
  existeNumeroMotor(numeroMotor: string): Promise<boolean>;
  existeNumeroChasis(numeroChasis: string): Promise<boolean>;
  /** Inserta en Tab_moto y devuelve el id generado. */
  guardar(moto: Moto): Promise<number>;
}

export interface VentaMotoRegistrada {
  id: number;
  nroVenta: string;
  fecha: Date;
}

export interface RepositorioVentasMoto {
  /** Inserta en Tab_venta_moto y devuelve id y número de venta generados. */
  guardar(venta: VentaMoto, motoId: number): Promise<VentaMotoRegistrada>;
}

/** Fila del listado TBL-12 (solo lectura). */
export interface FilaVentaMoto {
  id: number;
  nroVenta: string;
  fecha: Date;
  estado: EstadoVenta;
  marca: string;
  modelo: string;
  anio: number;
  color: string;
  numeroMotor: string;
  numeroChasis: string;
  cliente: string | null;
}

export interface ConsultaVentasMoto {
  listar(filtro?: { texto?: string }): Promise<FilaVentaMoto[]>;
}
