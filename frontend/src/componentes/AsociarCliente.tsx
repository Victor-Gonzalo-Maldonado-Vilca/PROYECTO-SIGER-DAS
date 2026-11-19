import { useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';
import type { FilaVentaMoto } from '../tipos';

/**
 * Panel de INT-017 — Asociar cliente a venta de moto (ILA-0017 / CU-VEN-10).
 * INP-01 criterio (DNI, RUC o nombres) · BTN-28 Buscar · TBL-12 resultados
 * · BTN-24 Confirmar asociación · BTN-02 Cancelar · MSG-57 / MSG-58.
 */

interface ClienteEncontrado {
  id: number;
  tipoDocumento: 'DNI' | 'RUC' | null;
  numeroDocumento: string | null;
  nombre: string;
  telefono: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
}

export function AsociarCliente({
  venta,
  alTerminar,
}: {
  venta: FilaVentaMoto;
  alTerminar: (mensaje?: string) => void;
}) {
  const [criterio, setCriterio] = useState('');
  const [resultados, setResultados] = useState<ClienteEncontrado[] | null>(null);
  const [elegido, setElegido] = useState<ClienteEncontrado | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [procesando, setProcesando] = useState(false);

  // BTN-28 Buscar
  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setElegido(null);
    if (criterio.trim().length < 2) {
      setError({ mensaje: 'Ingrese al menos 2 caracteres del DNI, RUC o nombre.' });
      return;
    }
    try {
      setResultados((await api.get<ClienteEncontrado[]>('/ventas-moto/clientes', { params: { q: criterio.trim() } })).data);
    } catch (err) {
      setError(leerErrorApi(err));
    }
  };

  // BTN-24 Confirmar asociación
  const confirmar = async () => {
    if (!elegido) return;
    setProcesando(true);
    setError(null);
    try {
      const r = await api.put<{ mensaje: string; nroVenta: string; cliente: string }>(`/ventas-moto/${venta.id}/cliente`, {
        clienteId: elegido.id,
        version: venta.version,
      });
      alTerminar(`${r.data.mensaje}: ${r.data.nroVenta} → ${r.data.cliente}.`); // MSG-58
    } catch (err) {
      setError(leerErrorApi(err));
    } finally {
      setProcesando(false);
    }
  };

  const noFiscal = (c: ClienteEncontrado) => !c.tipoDocumento || c.estado !== 'ACTIVO';

  return (
    <div className="tarjeta vista-previa">
      <h3>Asociar cliente a la venta {venta.nroVenta}</h3>
      <p className="sutil">
        {venta.marca} {venta.modelo} {venta.anio} · Motor {venta.numeroMotor} · Chasis {venta.numeroChasis}
      </p>

      <form className="busqueda" onSubmit={buscar}>
        <input
          autoFocus
          placeholder="DNI, RUC o nombres del cliente (INP-01)"
          value={criterio}
          onChange={(e) => setCriterio(e.target.value)}
        />
        <button type="submit" className="secundario">
          Buscar
        </button>
      </form>

      {resultados && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Documento</th>
                <th>Nombre / razón social</th>
                <th>Teléfono</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resultados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="sutil">
                    MSG-57: No se encontraron clientes que coincidan con el criterio ingresado. Regístrelo primero en
                    Clientes (MOD-05).
                  </td>
                </tr>
              ) : (
                resultados.map((c) => (
                  <tr
                    key={c.id}
                    className={elegido?.id === c.id ? 'seleccionada' : ''}
                    onClick={() => !noFiscal(c) && setElegido(c)}
                  >
                    <td>
                      <input
                        type="radio"
                        checked={elegido?.id === c.id}
                        disabled={noFiscal(c)}
                        onChange={() => setElegido(c)}
                        aria-label={c.nombre}
                      />
                    </td>
                    <td>{c.tipoDocumento ? `${c.tipoDocumento} ${c.numeroDocumento}` : '—'}</td>
                    <td>{c.nombre}</td>
                    <td>{c.telefono ?? '—'}</td>
                    <td className="sutil">
                      {!c.tipoDocumento ? 'Sin DNI/RUC: no se puede facturar' : c.estado !== 'ACTIVO' ? 'Dado de baja' : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className="mensaje error">
          {error.codigo && <strong>{error.codigo}: </strong>}
          {error.mensaje}
        </p>
      )}

      <div className="acciones">
        <button className="secundario" onClick={() => alTerminar()} disabled={procesando}>
          Cancelar
        </button>
        <button onClick={() => void confirmar()} disabled={!elegido || procesando}>
          {procesando ? 'Asociando…' : 'Confirmar asociación'}
        </button>
      </div>
    </div>
  );
}
