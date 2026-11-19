/**
 * MOD-01 Seguridad y Permisos (Vista Lógica §7.4.1).
 */

/** Enumeración Rol de la Vista Lógica (Fig. 3). */
export enum Rol {
  GERENTE = 'GERENTE',
  VENDEDOR = 'VENDEDOR',
  MECANICO = 'MECANICO',
}

/** Catálogo de módulos sujetos a control de acceso (Tab_modulo). */
export const Modulos = {
  SEGURIDAD: 'MOD-01',
  ORDENES_SERVICIO: 'MOD-02',
  INVENTARIO: 'MOD-03',
  VENTAS: 'MOD-04',
  CLIENTES: 'MOD-05',
  PROVEEDORES: 'MOD-06',
  PERSONAL: 'MOD-07',
  COMPROBANTES: 'MOD-08',
  FINANCIERO: 'MOD-09',
} as const;

export type CodigoModulo = (typeof Modulos)[keyof typeof Modulos];

/** Datos del operador que viajan en el token y llegan a los casos de uso. */
export interface UsuarioAutenticado {
  id: number;
  usuario: string;
  nombreCompleto: string;
  rol: Rol;
  /** Módulos habilitados por su PerfilPermiso. */
  modulos: CodigoModulo[];
}

/** PerfilPermiso.habilitaModulo(m) */
export function habilitaModulo(usuario: UsuarioAutenticado, modulo: CodigoModulo): boolean {
  return usuario.modulos.includes(modulo);
}
