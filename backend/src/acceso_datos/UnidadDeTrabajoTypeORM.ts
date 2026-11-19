import type { DataSource } from 'typeorm';
import type { RepositoriosTransaccionales, UnidadDeTrabajo } from '../aplicacion/puertos/UnidadDeTrabajo';
import { RepositorioAuditoriaTypeORM } from './repositorios/auditoria';
import { RepositorioMotosTypeORM, RepositorioVentasMotoTypeORM } from './repositorios/ventas';

/**
 * Implementación de la Unidad de Trabajo (UOW, Hito 3 Fig. 2) con PostgreSQL.
 * DataSource.transaction() ejecuta BEGIN; si el trabajo termina bien hace COMMIT,
 * y si lanza un error hace ROLLBACK y relanza el error.
 * Todos los repositorios reciben el MISMO EntityManager -> misma transacción.
 */
export class UnidadDeTrabajoTypeORM implements UnidadDeTrabajo {
  constructor(private readonly ds: DataSource) {}

  ejecutar<T>(trabajo: (repos: RepositoriosTransaccionales) => Promise<T>): Promise<T> {
    return this.ds.transaction(async (em) =>
      trabajo({
        motos: new RepositorioMotosTypeORM(em),
        ventasMoto: new RepositorioVentasMotoTypeORM(em),
        auditoria: new RepositorioAuditoriaTypeORM(em),
      }),
    );
  }
}
