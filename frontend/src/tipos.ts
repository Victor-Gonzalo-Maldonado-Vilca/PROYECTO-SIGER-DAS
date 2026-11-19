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
}
