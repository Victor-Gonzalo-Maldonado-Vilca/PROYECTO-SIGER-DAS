import type { ClienteComprador } from '../ventas/VentaMoto';
import type { Cliente, DatosCliente, EstadoCliente } from './Cliente';

/** Datos mínimos del cliente que captura la recepción del taller (ILA-0001). */
export interface DatosClienteRecepcion {
  nombre: string;
  telefono: string;
  documento: { tipo: 'DNI' | 'RUC'; numero: string } | null;
}

/** Repositorio transaccional de Tab_cliente (MOD-05). */
export interface RepositorioClientes {
  /**
   * ILA-0001: reconoce al cliente o lo registra.
   *  - con documento: el cliente con ese DNI/RUC (si no existe, se crea);
   *  - sin documento: el cliente con el mismo nombre y teléfono (si no existe, se crea).
   * No modifica los datos de un cliente ya registrado. Devuelve también su estado,
   * porque un cliente INACTIVO no puede abrir nuevas órdenes (CU-CLI-04).
   */
  obtenerOCrear(datos: DatosClienteRecepcion): Promise<{ id: number; estado: EstadoCliente }>;
  /** ILA-0017: datos del cliente elegido como comprador (FOR SHARE: no puede borrarse mientras tanto). */
  obtenerComprador(clienteId: number): Promise<ClienteComprador | null>;
  /** CU-TAL-03: actualiza nombres (INP-01) y teléfono (INP-02) del cliente de la orden. */
  actualizarContacto(clienteId: number, nombre: string, telefono: string): Promise<void>;

  /** CU-CLI-01 / CU-CLI-03 paso 6: ¿otro cliente tiene ya este documento? */
  existeDocumento(numero: string, excluirClienteId?: number): Promise<boolean>;
  /** CU-CLI-01 paso 7: INSERT con estado inicial ACTIVO (RN-CLI-02). */
  registrar(datos: DatosCliente): Promise<number>;
  /** CU-CLI-03 / CU-CLI-04: lee el cliente bloqueándolo (FOR UPDATE) hasta el COMMIT. */
  bloquear(clienteId: number): Promise<Cliente | null>;
  /** CU-CLI-03 paso 7: UPDATE; devuelve la nueva versión. */
  actualizar(clienteId: number, datos: DatosCliente): Promise<number>;
  /**
   * CU-CLI-04 paso 2: operaciones pendientes del cliente que impiden darlo de baja.
   * Devuelve una descripción por cada tipo de operación pendiente (vacío = puede inhabilitarse).
   */
  operacionesPendientes(clienteId: number): Promise<string[]>;
  /** CU-CLI-04 paso 5: baja lógica (RN-CLI-05); devuelve la nueva versión. */
  cambiarEstado(clienteId: number, estado: EstadoCliente): Promise<number>;
}

/** Fila de TBL-12 (padrón de clientes, CU-CLI-02). */
export interface FilaCliente extends Cliente {
  fechaRegistro: string;
}

/** CU-CLI-05: historial vehicular y comercial (INT-055, una lista por pestaña). */
export interface HistorialCliente {
  cliente: FilaCliente;
  vehiculos: Array<{
    motoId: number;
    placa: string | null;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
    color: string | null;
    /** Cómo se vincula al cliente: comprada en la tienda o atendida en el taller. */
    origen: 'COMPRA' | 'TALLER';
    nroVenta: string | null;
    fechaVenta: string | null;
  }>;
  ordenes: Array<{
    id: number;
    nroOrden: string;
    fechaRecepcion: string;
    tipoServicio: string;
    descripcion: string;
    estado: string;
    placa: string | null;
  }>;
  proformas: Array<{ id: number; fecha: string; estado: string; total: number; nroOrden: string | null }>;
  comprobantes: Array<{
    id: number;
    numero: string;
    tipo: string;
    fechaEmision: string;
    montoTotal: number;
    estado: string;
    transaccion: string;
  }>;
}

/** Consultas de solo lectura (CU-CLI-02 y CU-CLI-05, RN-CLI-03). */
export interface ConsultaClientes {
  listar(filtro: { texto?: string; estado?: EstadoCliente }): Promise<FilaCliente[]>;
  detalle(clienteId: number): Promise<FilaCliente | null>;
  historial(clienteId: number): Promise<HistorialCliente | null>;
}
