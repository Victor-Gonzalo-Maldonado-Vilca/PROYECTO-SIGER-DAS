import { ErrorConflicto } from '../../dominio/compartido/errores';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import { Moto, type DatosMoto } from '../../dominio/ventas/Moto';
import { validarPrecioVenta, VentaMoto } from '../../dominio/ventas/VentaMoto';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoRegistroVentaMoto {
  codigo: 'MSG-48';
  mensaje: string;
  ventaId: number;
  nroVenta: string;
  motoId: number;
  fecha: Date;
}

/**
 * Caso de uso ILA-0012 — Registrar los datos de la venta de motos (EDU-0004, INT-012).
 * Clase de control: GestorVentas.registrarVentaMoto() de la Vista Lógica.
 *
 * Flujo (Vista de Procesos v02.00, ILA-0012):
 *  pre. Sesión iniciada y permiso sobre MOD-04.
 *  5.   ¿INP-30 a INP-35 completos?  No -> MSG-45
 *  6.   ¿N.° de motor ya existe?     Sí -> MSG-46
 *  7.   ¿N.° de chasis ya existe?    Sí -> MSG-47
 *  8.   Transacción atómica: INSERT Tab_moto + INSERT Tab_venta_moto (+ auditoría).
 *       Si algo falla -> ROLLBACK, sin registros huérfanos (RNF-0004).
 *  10.  MSG-48 La moto y la venta han sido registradas exitosamente.
 */
export class RegistrarVentaMoto {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(
    entrada: Partial<Record<keyof DatosMoto | 'precio', unknown>>,
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoRegistroVentaMoto> {
    const usuario = autorizar(usuarioSesion, Modulos.VENTAS);

    // Paso 5: validación de dominio (MSG-45) antes de abrir la transacción.
    const moto = Moto.crear(entrada);
    const precio = validarPrecioVenta(entrada.precio); // adición al catálogo (necesario para ILA-0018)

    return this.uow.ejecutar(async (repos) => {
      // Pasos 6 y 7: verificación de unicidad (los índices únicos la refuerzan ante concurrencia).
      if (await repos.motos.existeNumeroMotor(moto.datos.numeroMotor)) {
        throw new ErrorConflicto('MSG-46', 'N.° de motor duplicado', 'numeroMotor');
      }
      if (await repos.motos.existeNumeroChasis(moto.datos.numeroChasis)) {
        throw new ErrorConflicto('MSG-47', 'N.° de chasis duplicado', 'numeroChasis');
      }

      // Paso 8: ambas inserciones dentro de la misma transacción.
      const motoId = await repos.motos.guardar(moto);
      const venta = VentaMoto.registrar(usuario.id, precio);
      const registrada = await repos.ventasMoto.guardar(venta, motoId);

      await repos.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'REGISTRAR_VENTA_MOTO',
        entidad: 'Tab_venta_moto',
        entidadId: registrada.id,
        detalle: { ilacion: 'ILA-0012', motoId, nroVenta: registrada.nroVenta },
      });

      return {
        codigo: 'MSG-48',
        mensaje: 'La moto y la venta han sido registradas exitosamente',
        ventaId: registrada.id,
        nroVenta: registrada.nroVenta,
        motoId,
        fecha: registrada.fecha,
      };
    });
  }
}
