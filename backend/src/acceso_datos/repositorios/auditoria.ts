import type { EntityManager } from 'typeorm';
import type { EntradaAuditoria, RepositorioAuditoria } from '../../dominio/auditoria/RepositorioAuditoria';
import { AuditoriaEsquema } from '../esquemas';

export class RepositorioAuditoriaTypeORM implements RepositorioAuditoria {
  constructor(private readonly em: EntityManager) {}

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    await this.em.getRepository(AuditoriaEsquema).insert({
      usuarioId: entrada.usuarioId,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: String(entrada.entidadId),
      detalle: entrada.detalle ?? undefined, // undefined -> NULL en la columna JSONB
      motivo: entrada.motivo ?? null,
    });
  }
}
