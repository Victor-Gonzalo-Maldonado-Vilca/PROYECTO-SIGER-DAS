export type Rol = 'GERENTE' | 'VENDEDOR' | 'MECANICO';

export interface Usuario {
  id: number;
  usuario: string;
  nombreCompleto: string;
  rol: Rol;
  modulos: string[];
}

export type EstadoVenta = 'SIN_CLIENTE' | 'CON_CLIENTE' | 'COMPROBANTE_EMITIDO';

export interface FilaVentaMoto {
  id: number;
  nroVenta: string;
  fecha: string;
  estado: EstadoVenta;
  marca: string;
  modelo: string;
  anio: number;
  color: string;
  numeroMotor: string;
  numeroChasis: string;
  cliente: string | null;
  /** Bloqueo optimista */
  version: number;
  /** null en ventas registradas antes de capturar el precio */
  precio: number | null;
}

// ---------------- MOD-05 Clientes (CU-CLI-01 a CU-CLI-05) ----------------
export type TipoDocumento = 'DNI' | 'RUC';
export type EstadoCliente = 'ACTIVO' | 'INACTIVO';

export interface Cliente {
  id: number;
  tipoDocumento: TipoDocumento | null;
  numeroDocumento: string | null;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  estado: EstadoCliente;
  version: number;
  fechaRegistro: string;
}

export interface HistorialCliente {
  cliente: Cliente;
  vehiculos: Array<{
    motoId: number;
    placa: string | null;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
    color: string | null;
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
