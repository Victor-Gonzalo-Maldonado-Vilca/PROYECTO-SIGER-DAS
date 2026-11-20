import type { EstadoCliente } from '../../dominio/clientes/Cliente';
import type { ConsultaClientes, FilaCliente, HistorialCliente } from '../../dominio/clientes/repositorios';
import { ErrorDominio } from '../../dominio/compartido/errores';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import { autorizar } from '../seguridad/autorizar';

/**
 * CU-CLI-02 — Consultar Información de Clientes y CU-CLI-05 — Historial Vehicular
 * y Comercial (EDU-0020, MOD-05). Solo lectura (RN-CLI-03): no abren transacción
 * de escritura.
 */
export class ConsultarClientes {
  constructor(private readonly consulta: ConsultaClientes) {}

  /** Pasos 2-5: TBL-12 con INP-01 (DNI, RUC o nombre) y SEL-01 (Activo, Inactivo, Todos). */
  async listar(usuarioSesion: UsuarioAutenticado | undefined, texto?: unknown, estado?: unknown): Promise<FilaCliente[]> {
    autorizar(usuarioSesion, Modulos.CLIENTES);
    const criterio = typeof texto === 'string' && texto.trim() ? texto.trim() : undefined;
    const filtroEstado: EstadoCliente | undefined =
      estado === 'ACTIVO' || estado === 'INACTIVO' ? estado : undefined;
    return this.consulta.listar({ texto: criterio, estado: filtroEstado });
  }

  /** Pasos 6-7: BTN-05 Ver detalle (INT_051_DETALLE). */
  async detalle(usuarioSesion: UsuarioAutenticado | undefined, clienteId: number): Promise<FilaCliente> {
    autorizar(usuarioSesion, Modulos.CLIENTES);
    const cliente = await this.consulta.detalle(clienteId);
    if (!cliente) throw new ErrorDominio('NO-ENCONTRADO', 'El cliente no existe.');
    return cliente;
  }

  /**
   * CU-CLI-05: BTN-08 Ver historial (INT-055). Incluye clientes inactivos (RN-CLI-06).
   * Las pestañas sin datos se muestran vacías en la interfaz (flujo 3.a).
   */
  async historial(usuarioSesion: UsuarioAutenticado | undefined, clienteId: number): Promise<HistorialCliente> {
    autorizar(usuarioSesion, Modulos.CLIENTES);
    const historial = await this.consulta.historial(clienteId);
    if (!historial) throw new ErrorDominio('NO-ENCONTRADO', 'El cliente no existe.');
    return historial;
  }
}
