import { EntitySchema } from 'typeorm';

/**
 * Mapeo objeto-relacional (Vista Lógica §7.9, Tabla 21).
 * Se usan EntitySchema (sin decoradores) para que las clases del dominio
 * no dependan de TypeORM. El esquema real se crea con db/init/*.sql
 * (synchronize = false).
 */

export interface MotoFila {
  id: number;
  placa: string | null;
  marca: string;
  modelo: string;
  anio: number;
  color: string;
  numeroMotor: string;
  numeroChasis: string;
  clienteId: number | null;
  creadoEn: Date;
}

export const MotoEsquema = new EntitySchema<MotoFila>({
  name: 'Moto',
  tableName: 'tab_moto',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    placa: { type: String, nullable: true },
    marca: { type: String },
    modelo: { type: String },
    anio: { type: 'int' },
    color: { type: String },
    numeroMotor: { type: String, name: 'numero_motor' },
    numeroChasis: { type: String, name: 'numero_chasis' },
    clienteId: { type: 'int', name: 'cliente_id', nullable: true },
    creadoEn: { type: 'timestamptz', name: 'creado_en', insert: false, update: false },
  },
});

export interface VentaMotoFila {
  id: number;
  nroVenta: string;
  fecha: Date;
  precio: string | null;
  estado: string;
  motoId: number;
  clienteId: number | null;
  usuarioId: number;
  version: number;
}

export const VentaMotoEsquema = new EntitySchema<VentaMotoFila>({
  name: 'VentaMoto',
  tableName: 'tab_venta_moto',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    // nro_venta y fecha los genera PostgreSQL (DEFAULT); por eso insert: false.
    nroVenta: { type: String, name: 'nro_venta', insert: false, update: false },
    fecha: { type: 'timestamptz', insert: false, update: false },
    precio: { type: 'numeric', nullable: true },
    estado: { type: String },
    motoId: { type: 'int', name: 'moto_id' },
    clienteId: { type: 'int', name: 'cliente_id', nullable: true },
    usuarioId: { type: 'int', name: 'usuario_id' },
    // Bloqueo optimista (RNF-0008): TypeORM incrementa la versión en cada UPDATE.
    version: { type: 'int', version: true },
  },
});

export interface AuditoriaFila {
  id: string;
  usuarioId: number;
  accion: string;
  entidad: string;
  entidadId: string;
  /** JSONB libre: TypeORM lo serializa al insertar. */
  detalle: unknown;
  motivo: string | null;
  fechaHora: Date;
}

export const AuditoriaEsquema = new EntitySchema<AuditoriaFila>({
  name: 'Auditoria',
  tableName: 'tab_auditoria',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    usuarioId: { type: 'int', name: 'usuario_id' },
    accion: { type: String },
    entidad: { type: String },
    entidadId: { type: 'bigint', name: 'entidad_id' },
    detalle: { type: 'jsonb', nullable: true },
    motivo: { type: String, nullable: true },
    fechaHora: { type: 'timestamptz', name: 'fecha_hora', insert: false, update: false },
  },
});

export const ESQUEMAS = [MotoEsquema, VentaMotoEsquema, AuditoriaEsquema];
