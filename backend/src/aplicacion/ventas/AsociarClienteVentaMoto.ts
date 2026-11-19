import { ErrorConflicto, ErrorDominio } from '../../dominio/compartido/errores';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import { EstadoVenta, motivoNoAsociable } from '../../dominio/ventas/VentaMoto';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoAsociacion {
  codigo: 'MSG-58';
  mensaje: string;
  nroVenta: string;
  cliente: string;
  estado: EstadoVenta;
  version: number;
}

/**
 * ILA-0017 / CU-VEN-10 — Asociar cliente a venta de moto (EDU-0004, INT-017).
 * Clase de control: GestorVentas (MOD-04).
 *
 *  7. El actor confirma el cliente elegido en TBL-12 (BTN-24).
 *  8. UPDATE atómico de Tab_venta_moto con la FK del cliente; la venta pasa de
 *     SIN_CLIENTE a CON_CLIENTE (diagrama de estados «Venta de Motocicleta»).
 *  9. MSG-58 de confirmación.
 * Concurrencia: la venta se bloquea (FOR UPDATE) y se compara la versión que el
 * usuario vio; si otro vendedor la asoció primero, se informa en vez de sobrescribir.
 */
export class AsociarClienteVentaMoto {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(
    ventaId: number,
    entrada: { clienteId?: unknown; version?: unknown },
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoAsociacion> {
    const usuario = autorizar(usuarioSesion, Modulos.VENTAS);
    const clienteId = Number(entrada.clienteId);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      throw new ErrorDominio('VAL-CLIENTE', 'Seleccione el cliente comprador.', 'clienteId');
    }
    const versionVista = Number(entrada.version);
    if (!Number.isInteger(versionVista)) {
      throw new ErrorDominio('VAL-VERSION', 'Falta la versión de la venta. Recargue el listado.');
    }

    return this.uow.ejecutar(async (r) => {
      const venta = await r.ventasMoto.bloquear(ventaId);
      if (!venta) throw new ErrorDominio('NO-ENCONTRADO', 'La venta de moto no existe.');
      const cliente = await r.clientes.obtenerComprador(clienteId);
      if (!cliente) throw new ErrorDominio('MSG-57', 'No se encontró el cliente seleccionado.', 'clienteId');

      if (venta.version !== versionVista && venta.estado === EstadoVenta.SIN_CLIENTE) {
        throw new ErrorConflicto(
          'VENTA-MODIFICADA',
          `Otro usuario modificó la venta ${venta.nroVenta}. Recargue el listado.`,
        );
      }
      const motivo = motivoNoAsociable(venta.estado, cliente);
      if (motivo) {
        const enConflicto = venta.estado !== EstadoVenta.SIN_CLIENTE;
        const mensaje = `No se puede asociar el cliente: ${motivo}.`;
        throw enConflicto
          ? new ErrorConflicto('VENTA-CON-CLIENTE', mensaje)
          : new ErrorDominio('CLIENTE-NO-FISCAL', mensaje, 'clienteId');
      }

      const version = await r.ventasMoto.asociarCliente(venta.id, cliente.id);
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'ASOCIAR_CLIENTE_VENTA_MOTO',
        entidad: 'Tab_venta_moto',
        entidadId: venta.id,
        detalle: { ilacion: 'ILA-0017', clienteId: cliente.id, documento: cliente.numeroDocumento },
      });

      return {
        codigo: 'MSG-58',
        mensaje: 'Cliente asociado a la venta correctamente',
        nroVenta: venta.nroVenta,
        cliente: cliente.nombre,
        estado: EstadoVenta.CON_CLIENTE,
        version,
      };
    });
  }
}
