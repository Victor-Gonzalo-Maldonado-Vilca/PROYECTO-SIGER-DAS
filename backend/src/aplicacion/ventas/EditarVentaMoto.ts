import { ErrorAutorizacion, ErrorConflicto, ErrorDominio } from '../../dominio/compartido/errores';
import { Modulos, Rol, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import { Moto, type DatosMoto } from '../../dominio/ventas/Moto';
import { EstadoVenta, validarPrecioVenta } from '../../dominio/ventas/VentaMoto';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoEdicionVenta {
  codigo: 'MSG-52';
  mensaje: string;
  nroVenta: string;
  version: number;
}

/**
 * CU-VEN-08 — Actualizar venta de motocicleta (EDU-0004, INT-014).
 * Clase de control: GestorVentas (MOD-04).
 *
 *  Actor: solo Gerente / Administrador (precondición 1: «permisos directivos», ESP-0014).
 *  3.  «Verificar existencia de comprobante definitivo»: con comprobante -> MSG-51 (RN-VEN-12).
 *      También se bloquea si el comprobante está GENERADO y pendiente de SUNAT: su monto ya
 *      quedó fijado y cambiar el precio lo dejaría inconsistente.
 *  7.  Obligatorios (MSG-45) y unicidad de motor/chasis EXCLUYENDO la propia moto (MSG-46/47, RN-VEN-13).
 *  8.  UPDATE atómico de Tab_moto y Tab_venta_moto (+ auditoría).
 *  9.  MSG-52 confirmación.
 *  El precio es editable (adición al catálogo, igual que en ILA-0012).
 *  Bloqueo optimista: se compara la versión que el gerente vio al abrir el formulario.
 */
export class EditarVentaMoto {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(
    ventaId: number,
    entrada: Partial<Record<keyof DatosMoto | 'precio' | 'version', unknown>>,
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoEdicionVenta> {
    const usuario = autorizar(usuarioSesion, Modulos.VENTAS);
    if (usuario.rol !== Rol.GERENTE) {
      throw new ErrorAutorizacion('Solo el Gerente / Administrador puede editar ventas de motos.');
    }
    const moto = Moto.crear(entrada);
    const precio = validarPrecioVenta(entrada.precio);
    const versionVista = Number(entrada.version);
    if (!Number.isInteger(versionVista)) {
      throw new ErrorDominio('VAL-VERSION', 'Falta la versión de la venta. Recargue el listado.');
    }

    return this.uow.ejecutar(async (r) => {
      const venta = await r.ventasMoto.bloquearParaEdicion(ventaId);
      if (!venta) throw new ErrorDominio('NO-ENCONTRADO', 'La venta de moto no existe.');

      if (venta.tieneComprobante || venta.estado === EstadoVenta.COMPROBANTE_EMITIDO) {
        throw new ErrorConflicto(
          'MSG-51',
          'No es posible editar esta venta porque cuenta con un comprobante definitivo emitido.',
        );
      }
      if (venta.version !== versionVista) {
        throw new ErrorConflicto(
          'VENTA-MODIFICADA',
          `Otro usuario modificó la venta ${venta.nroVenta} mientras usted la editaba. Recargue para ver los cambios.`,
        );
      }
      if (await r.motos.existeNumeroMotor(moto.datos.numeroMotor, venta.motoId)) {
        throw new ErrorConflicto('MSG-46', 'N.° de motor duplicado', 'numeroMotor');
      }
      if (await r.motos.existeNumeroChasis(moto.datos.numeroChasis, venta.motoId)) {
        throw new ErrorConflicto('MSG-47', 'N.° de chasis duplicado', 'numeroChasis');
      }

      await r.motos.actualizarDatos(venta.motoId, moto);
      const version = await r.ventasMoto.actualizarPrecio(venta.id, precio);
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'EDITAR_VENTA_MOTO',
        entidad: 'Tab_venta_moto',
        entidadId: venta.id,
        detalle: { casoDeUso: 'CU-VEN-08', moto: moto.datos, precio },
      });

      return { codigo: 'MSG-52', mensaje: 'Venta de moto actualizada correctamente', nroVenta: venta.nroVenta, version };
    });
  }
}
