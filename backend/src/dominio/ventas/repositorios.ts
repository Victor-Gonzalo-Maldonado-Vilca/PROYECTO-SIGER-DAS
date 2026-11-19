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
  /** ILA-0001: busca la moto por placa y bloquea su fila (FOR UPDATE). */
  bloquearPorPlaca(placa: string): Promise<{ id: number; clienteId: number | null } | null>;
  /** ILA-0001: registra una moto que ingresa al taller (solo placa, color y modelo). */
  registrarRecibida(datos: { placa: string; color: string | null; modelo: string | null; clienteId: number }): Promise<number>;
  /** CU-TAL-03: actualiza color (INP-04) y modelo (INP-05). */
  actualizarDescripcion(motoId: number, color: string | null, modelo: string | null): Promise<void>;
}

export interface VentaMotoRegistrada {
  id: number;
  nroVenta: string;
  fecha: Date;
}

export interface VentaParaAsociar {
  id: number;
  nroVenta: string;
  estado: EstadoVenta;
  /** Bloqueo optimista (RNF-0008). */
  version: number;
}

export interface RepositorioVentasMoto {
  /** Inserta en Tab_venta_moto y devuelve id y número de venta generados. */
  guardar(venta: VentaMoto, motoId: number): Promise<VentaMotoRegistrada>;
  /** ILA-0017: lee la venta con FOR UPDATE. */
  bloquear(ventaId: number): Promise<VentaParaAsociar | null>;
  /** ILA-0017 paso 8: guarda la FK del cliente y pasa la venta a CON_CLIENTE. Devuelve la nueva versión. */
  asociarCliente(ventaId: number, clienteId: number): Promise<number>;
}

/** Fila de TBL-12: cliente encontrado en la búsqueda de ILA-0017. */
export interface FilaClienteBusqueda {
  id: number;
  tipoDocumento: 'DNI' | 'RUC' | null;
  numeroDocumento: string | null;
  nombre: string;
  telefono: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
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
  version: number;
  /** null en ventas registradas antes de capturar el precio. */
  precio: number | null;
}

export interface ConsultaVentasMoto {
  /** soloSinCliente: TBL-18 de INT-017 (ventas pendientes de asociación). */
  listar(filtro?: { texto?: string; soloSinCliente?: boolean }): Promise<FilaVentaMoto[]>;
  /** Paso 6 de CU-VEN-10: busca clientes por DNI, RUC o nombres (TBL-12). */
  buscarClientes(texto: string): Promise<FilaClienteBusqueda[]>;
}
