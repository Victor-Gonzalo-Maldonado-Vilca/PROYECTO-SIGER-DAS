/**
 * Servicio de auditoría y trazabilidad (Arquitectura Genérica; Tab_AUD).
 * Se escribe DENTRO de la misma transacción que la operación auditada (Hito 3, Fig. 3).
 */
export interface EntradaAuditoria {
  usuarioId: number;
  accion: string;
  entidad: string;
  entidadId: number;
  detalle?: Record<string, unknown>;
  motivo?: string;
}

export interface RepositorioAuditoria {
  registrar(entrada: EntradaAuditoria): Promise<void>;
}
