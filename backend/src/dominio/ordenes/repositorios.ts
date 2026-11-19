import type { EstadoOrden, OrdenParaConformidad } from './OrdenServicio';

/** Ítem de la proforma (servicio o insumo) que se resume en TBL-07. */
export interface ItemServicio {
  tipoItem: 'REPUESTO' | 'SERVICIO';
  descripcion: string;
  cantidad: number;
  subtotal: number;
}

export interface RepositorioOrdenesServicio {
  /**
   * Lee la orden con SELECT ... FOR UPDATE: bloquea la fila hasta el fin de la
   * transacción, de modo que dos conformidades simultáneas para la misma orden
   * se ejecuten una después de la otra.
   */
  bloquearParaConformidad(ordenId: number): Promise<OrdenParaConformidad | null>;
  itemsDeProforma(proformaId: number): Promise<ItemServicio[]>;
  cambiarEstado(ordenId: number, nuevo: EstadoOrden): Promise<void>;
}

export interface RepositorioHistorialOrden {
  registrar(e: { ordenId: number; anterior: EstadoOrden; nuevo: EstadoOrden; usuarioId: number }): Promise<void>;
}

export interface NuevaConformidad {
  ordenId: number;
  proformaId: number | null;
  kilometraje: number;
  trabajosRealizados: string;
  insumosEmpleados: string;
  precioTotal: number;
  firmaPng: Buffer;
  usuarioId: number;
}

export interface RepositorioConformidades {
  guardar(c: NuevaConformidad): Promise<{ id: number; nroConformidad: string; fechaEmision: Date }>;
}

// ------------------------- Consultas (solo lectura) -------------------------

/** Opción del selector SEL-04. */
export interface OrdenApta {
  id: number;
  nroOrden: string;
  estado: EstadoOrden;
  placa: string | null;
  cliente: string;
}

/** Resumen de solo lectura: TBL-05 cliente, TBL-06 vehículo, TBL-07 servicios. */
export interface ResumenOrden {
  orden: { id: number; nroOrden: string; estado: EstadoOrden; tipoServicio: string; descripcion: string };
  cliente: { tipoDocumento: string; numeroDocumento: string; nombre: string; telefono: string | null };
  vehiculo: { placa: string | null; marca: string; modelo: string; anio: number; color: string };
  servicios: ItemServicio[];
  precioTotal: number;
}

export interface FilaConformidad {
  id: number;
  nroConformidad: string;
  fechaEmision: Date;
  nroOrden: string;
  placa: string | null;
  cliente: string;
  kilometraje: number;
  precioTotal: number;
}

export interface ConsultaConformidades {
  ordenesAptas(): Promise<OrdenApta[]>;
  resumenOrden(ordenId: number): Promise<ResumenOrden | null>;
  listar(): Promise<FilaConformidad[]>;
  firma(conformidadId: number): Promise<Buffer | null>;
}
