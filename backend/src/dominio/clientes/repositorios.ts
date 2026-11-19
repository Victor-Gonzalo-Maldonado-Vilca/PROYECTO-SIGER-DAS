import type { ClienteComprador } from '../ventas/VentaMoto';

/**
 * MOD-05 Clientes — mínimo necesario para la recepción del taller (ILA-0001).
 * El registro completo de clientes es ILA-0079 (pendiente).
 */
export interface DatosClienteRecepcion {
  nombre: string;
  telefono: string;
  documento: { tipo: 'DNI' | 'RUC'; numero: string } | null;
}

export interface RepositorioClientes {
  /**
   * Reconoce al cliente o lo registra:
   *  - con documento: el cliente con ese DNI/RUC (si no existe, se crea);
   *  - sin documento: el cliente con el mismo nombre y teléfono (si no existe, se crea).
   * No modifica los datos de un cliente ya registrado.
   */
  obtenerOCrear(datos: DatosClienteRecepcion): Promise<number>;
  /** ILA-0017: datos del cliente elegido como comprador (FOR SHARE: no puede borrarse mientras tanto). */
  obtenerComprador(clienteId: number): Promise<ClienteComprador | null>;
  /** CU-TAL-03: actualiza nombres (INP-01) y teléfono (INP-02) del cliente de la orden. */
  actualizarContacto(clienteId: number, nombre: string, telefono: string): Promise<void>;
}
