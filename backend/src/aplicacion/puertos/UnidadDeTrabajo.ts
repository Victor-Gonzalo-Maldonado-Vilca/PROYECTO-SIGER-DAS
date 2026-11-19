import type { RepositorioAuditoria } from '../../dominio/auditoria/RepositorioAuditoria';
import type {
  RepositorioComprobantes,
  RepositorioPendientes,
  RepositorioTransaccionesFacturables,
} from '../../dominio/comprobantes/repositorios';
import type {
  RepositorioConformidades,
  RepositorioHistorialOrden,
  RepositorioOrdenesServicio,
} from '../../dominio/ordenes/repositorios';
import type { RepositorioMotos, RepositorioVentasMoto } from '../../dominio/ventas/repositorios';

/**
 * Repositorios que comparten UNA misma transacción.
 * Al agregar un módulo nuevo, añadir aquí sus repositorios transaccionales.
 */
export interface RepositoriosTransaccionales {
  motos: RepositorioMotos;
  ventasMoto: RepositorioVentasMoto;
  ordenes: RepositorioOrdenesServicio;
  historialOrden: RepositorioHistorialOrden;
  conformidades: RepositorioConformidades;
  transacciones: RepositorioTransaccionesFacturables;
  comprobantes: RepositorioComprobantes;
  pendientes: RepositorioPendientes;
  auditoria: RepositorioAuditoria;
}

/**
 * Coordinación transaccional (decisión PRO-02 del Hito 3):
 *  - La capa de Aplicación DELIMITA la transacción llamando a ejecutar().
 *  - La capa de Acceso a Datos la IMPLEMENTA (BEGIN / COMMIT / ROLLBACK).
 * Si `trabajo` lanza cualquier error, se hace rollback completo (RNF-0004).
 */
export interface UnidadDeTrabajo {
  ejecutar<T>(trabajo: (repos: RepositoriosTransaccionales) => Promise<T>): Promise<T>;
}
