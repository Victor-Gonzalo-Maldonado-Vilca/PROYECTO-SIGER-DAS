import { errorDocumentoDuplicado, validarDatosCliente } from '../../dominio/clientes/Cliente';
import { Modulos, type UsuarioAutenticado } from '../../dominio/seguridad/permisos';
import type { UnidadDeTrabajo } from '../puertos/UnidadDeTrabajo';
import { autorizar } from '../seguridad/autorizar';

export interface ResultadoRegistroCliente {
  codigo: 'MSG-101';
  mensaje: string;
  clienteId: number;
}

/**
 * CU-CLI-01 — Registrar Cliente (EDU-0020, MOD-05). Clase de control: GestorClientes.
 *  5. Valida obligatoriedad y formato.
 *  6. Verifica la unicidad del documento en Tab_cliente (RN-CLI-01) -> MSG-102.
 *  7. INSERT atómico con estado ACTIVO (RN-CLI-02), junto con la auditoría.
 *  8. MSG-101.
 * Si dos usuarios registran el mismo documento a la vez, ambos pasan el paso 6,
 * pero la restricción UNIQUE rechaza el segundo INSERT y se traduce a MSG-102.
 */
export class RegistrarCliente {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async ejecutar(
    entrada: Record<string, unknown>,
    usuarioSesion: UsuarioAutenticado | undefined,
  ): Promise<ResultadoRegistroCliente> {
    const usuario = autorizar(usuarioSesion, Modulos.CLIENTES);
    const datos = validarDatosCliente(entrada, true);

    return this.uow.ejecutar(async (r) => {
      if (await r.clientes.existeDocumento(datos.numeroDocumento!)) throw errorDocumentoDuplicado();
      const clienteId = await r.clientes.registrar(datos);
      await r.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'REGISTRAR_CLIENTE',
        entidad: 'Tab_cliente',
        entidadId: clienteId,
        detalle: { casoDeUso: 'CU-CLI-01', documento: datos.numeroDocumento },
      });
      return { codigo: 'MSG-101', mensaje: 'Cliente registrado exitosamente', clienteId };
    });
  }
}
