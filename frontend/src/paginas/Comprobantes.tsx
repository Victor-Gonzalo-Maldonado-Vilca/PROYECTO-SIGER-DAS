import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';
import type { Usuario } from '../tipos';

/**
 * INT-018 — Gestión de Comprobantes de Pago: emitir boleta (ILA-0018, EDU-0005).
 * TBL-19 · INP-36/INP-01 + BTN-28 Buscar · BTN-21 Emitir Boleta · vista previa
 * (LBL-10 cliente, LBL-11 detalle, LBL-12 total) · BTN-31 Confirmar · BTN-02 Cancelar
 * · MSG-59/60/61/62 · BTN-22 Imprimir o Descargar.
 */

interface Pendiente {
  tipo: string;
  id: number;
  referencia: string;
  cliente: string;
  documento: string;
  total: number;
  fecha: string;
}

interface VistaPrevia {
  numeroReferencial: string;
  fecha: string;
  transaccion: { tipo: string; id: number; referencia: string };
  cliente: { tipoDocumento: string; numeroDocumento: string; nombre: string };
  items: Array<{ descripcion: string; cantidad: number; importe: number }>;
  subtotal: number;
  igv: number;
  total: number;
}

interface FilaComprobante {
  id: number;
  numeroCompleto: string;
  fechaEmision: string;
  cliente: string;
  total: number;
  estado: 'GENERADO' | 'EMITIDO' | 'RECHAZADO';
  estadoEnvio: string | null;
  intentos: number;
  ultimoError: string | null;
  referenciaTransaccion: string;
}

interface Documento {
  numeroCompleto: string;
  fechaEmision: string;
  estado: string;
  emisor: { ruc: string; razonSocial: string; direccionFiscal: string };
  cliente: { tipoDocumento: string; numeroDocumento: string; nombre: string };
  items: Array<{ descripcion: string; cantidad: number; importe: number }>;
  subtotal: number;
  igv: number;
  total: number;
  codigoRespuesta: string | null;
  descripcionRespuesta: string | null;
}

interface ResultadoEmision {
  codigo: string;
  mensaje: string;
  emitido: boolean;
  comprobanteId: number;
  numeroCompleto: string;
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const TIPO: Record<string, string> = { VENTA_MOTO: 'Venta de moto', ORDEN_SERVICIO: 'Orden de servicio' };
const ENVIO: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  CONFIRMADO: 'Confirmado',
  RECHAZADO: 'Rechazado',
  POR_CONCILIAR: 'Por conciliar',
  REVISION_REQUERIDA: 'Revisión requerida',
};
const REINTENTABLE = ['PENDIENTE', 'POR_CONCILIAR'];

export default function Comprobantes({ usuario }: { usuario: Usuario }) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAplicado, setFiltroAplicado] = useState('');
  const [seleccion, setSeleccion] = useState<Pendiente | null>(null);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [comprobantes, setComprobantes] = useState<FilaComprobante[]>([]);
  const [documento, setDocumento] = useState<Documento | null>(null);
  const [modoSunat, setModoSunat] = useState<{ modo: string; modos: string[] } | null>(null);

  const cargarPendientes = useCallback(async (q = '') => {
    const r = await api.get<Pendiente[]>('/comprobantes/transacciones-pendientes', { params: q ? { q } : {} });
    setPendientes(r.data);
    setFiltroAplicado(q);
  }, []);

  const cargarComprobantes = useCallback(async () => {
    setComprobantes((await api.get<FilaComprobante[]>('/comprobantes')).data);
  }, []);

  useEffect(() => {
    cargarPendientes().catch((e) => setError(leerErrorApi(e)));
    cargarComprobantes().catch((e) => setError(leerErrorApi(e)));
    // Solo desarrollo: panel de la SUNAT simulada (si el perfil puede verlo).
    api
      .get('/dev/sunat-simulado')
      .then((r) => setModoSunat(r.data))
      .catch(() => setModoSunat(null));
    // Refresca el estado de envío: el job puede confirmar comprobantes en segundo plano.
    const t = setInterval(() => {
      cargarComprobantes().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [cargarPendientes, cargarComprobantes, usuario.id]);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setSeleccion(null);
    cargarPendientes(busqueda.trim()).catch((err) => setError(leerErrorApi(err)));
  };

  // BTN-21 Emitir Boleta -> paso 6, vista previa
  const abrirVistaPrevia = async () => {
    if (!seleccion) return;
    setError(null);
    setResultado(null);
    try {
      const r = await api.get<VistaPrevia>('/comprobantes/vista-previa', {
        params: { tipo: seleccion.tipo, id: seleccion.id },
      });
      setVista(r.data);
    } catch (err) {
      setError(leerErrorApi(err));
    }
  };

  // BTN-02 Cancelar: descarta la vista previa sin registrar nada ni enviar a SUNAT.
  const cancelar = () => setVista(null);

  // BTN-31 Confirmar emisión
  const confirmar = async () => {
    if (!vista) return;
    setProcesando(true);
    setError(null);
    try {
      const r = await api.post<ResultadoEmision>('/comprobantes/boletas', {
        tipoTransaccion: vista.transaccion.tipo,
        transaccionId: vista.transaccion.id,
      });
      setResultado(r.data);
      setVista(null);
      setSeleccion(null);
      await Promise.all([cargarPendientes(filtroAplicado), cargarComprobantes()]); // paso 11
    } catch (err) {
      setError(leerErrorApi(err));
    } finally {
      setProcesando(false);
    }
  };

  const reintentar = async (id: number) => {
    setError(null);
    try {
      await api.post(`/comprobantes/${id}/reintentar`);
    } catch (err) {
      setError(leerErrorApi(err));
    }
    await Promise.all([cargarPendientes(filtroAplicado), cargarComprobantes()]);
  };

  // BTN-22 Imprimir o Descargar
  const verDocumento = async (id: number) => {
    try {
      setDocumento((await api.get<Documento>(`/comprobantes/${id}`)).data);
    } catch (err) {
      setError(leerErrorApi(err));
    }
  };

  const cambiarModoSunat = async (modo: string) => {
    const r = await api.put('/dev/sunat-simulado', { modo });
    setModoSunat((m) => (m ? { ...m, modo: r.data.modo } : m));
  };

  return (
    <section>
      <div className="encabezado">
        <h2>Comprobantes de pago · Boletas</h2>
        {modoSunat && (
          <label className="sunat-dev">
            SUNAT simulada (desarrollo)
            <select value={modoSunat.modo} onChange={(e) => void cambiarModoSunat(e.target.value)}>
              {modoSunat.modos.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {resultado && (
        <div className={`mensaje ${resultado.emitido ? 'exito' : 'error'}`}>
          <strong>{resultado.codigo}: </strong>
          {resultado.mensaje} ({resultado.numeroCompleto})
          {resultado.emitido && (
            <button className="secundario enlinea" onClick={() => void verDocumento(resultado.comprobanteId)}>
              Imprimir o descargar
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="mensaje error">
          {error.codigo && <strong>{error.codigo}: </strong>}
          {error.mensaje}
        </p>
      )}

      {/* Paso 6: vista previa */}
      {vista && (
        <div className="tarjeta vista-previa">
          <h3>Vista previa de la boleta</h3>
          <p className="sutil">
            N.° {vista.numeroReferencial} (referencial: el número definitivo se asigna al confirmar) ·{' '}
            {new Date(vista.fecha).toLocaleString('es-PE')} · {TIPO[vista.transaccion.tipo]} {vista.transaccion.referencia}
          </p>
          <p>
            <strong>Cliente:</strong> {vista.cliente.nombre} — {vista.cliente.tipoDocumento} {vista.cliente.numeroDocumento}
          </p>
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cant.</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {vista.items.map((i, k) => (
                <tr key={k}>
                  <td className="ajustar">{i.descripcion}</td>
                  <td>{i.cantidad}</td>
                  <td>{soles(i.importe)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Op. gravada</td>
                <td>{soles(vista.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={2}>IGV (18 %)</td>
                <td>{soles(vista.igv)}</td>
              </tr>
              <tr>
                <th colSpan={2}>Importe total</th>
                <th>{soles(vista.total)}</th>
              </tr>
            </tfoot>
          </table>
          <div className="acciones">
            <button className="secundario" onClick={cancelar} disabled={procesando}>
              Cancelar
            </button>
            <button onClick={() => void confirmar()} disabled={procesando}>
              {procesando ? 'Enviando a SUNAT…' : 'Confirmar emisión'}
            </button>
          </div>
        </div>
      )}

      {/* TBL-19 */}
      <div className="tarjeta">
        <div className="encabezado">
          <h3>Transacciones pendientes de boleta</h3>
          <form onSubmit={buscar} className="busqueda">
            <input
              placeholder="N.° de transacción, cliente o DNI"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <button type="submit" className="secundario">
              Buscar
            </button>
          </form>
        </div>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>N.° transacción</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>DNI</th>
                <th>Monto total</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="sutil">
                    {filtroAplicado
                      ? 'MSG-60: Sin resultados para el criterio ingresado.'
                      : 'MSG-59: No existen transacciones pendientes de boleta para personas naturales.'}
                  </td>
                </tr>
              ) : (
                pendientes.map((p) => {
                  const marcada = seleccion?.tipo === p.tipo && seleccion.id === p.id;
                  return (
                    <tr key={`${p.tipo}-${p.id}`} className={marcada ? 'seleccionada' : ''} onClick={() => setSeleccion(p)}>
                      <td>
                        <input type="radio" checked={marcada} onChange={() => setSeleccion(p)} aria-label={p.referencia} />
                      </td>
                      <td>{p.referencia}</td>
                      <td>{TIPO[p.tipo] ?? p.tipo}</td>
                      <td>{p.cliente}</td>
                      <td>{p.documento}</td>
                      <td>{soles(p.total)}</td>
                      <td>{new Date(p.fecha).toLocaleDateString('es-PE')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="acciones">
          <button disabled={!seleccion || !!vista} onClick={() => void abrirVistaPrevia()}>
            Emitir boleta
          </button>
        </div>
      </div>

      {/* Comprobantes y estado de envío a SUNAT */}
      <div className="tarjeta">
        <h3>Comprobantes</h3>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>N.° comprobante</th>
                <th>Fecha</th>
                <th>Transacción</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Envío SUNAT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {comprobantes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="sutil">
                    Aún no hay comprobantes.
                  </td>
                </tr>
              ) : (
                comprobantes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.numeroCompleto}</td>
                    <td>{new Date(c.fechaEmision).toLocaleString('es-PE')}</td>
                    <td>{c.referenciaTransaccion}</td>
                    <td>{c.cliente}</td>
                    <td>{soles(c.total)}</td>
                    <td>
                      <span className={`estado ${c.estado}`}>{c.estado}</span>
                    </td>
                    <td title={c.ultimoError ?? ''}>
                      {c.estadoEnvio ? ENVIO[c.estadoEnvio] ?? c.estadoEnvio : '—'}
                      {c.intentos > 0 && <span className="sutil"> · {c.intentos} int.</span>}
                    </td>
                    <td>
                      {c.estado === 'EMITIDO' && (
                        <button className="secundario" onClick={() => void verDocumento(c.id)}>
                          Imprimir
                        </button>
                      )}
                      {c.estadoEnvio && REINTENTABLE.includes(c.estadoEnvio) && (
                        <button className="secundario" onClick={() => void reintentar(c.id)}>
                          Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BTN-22: representación imprimible */}
      {documento && (
        <div className="fondo-modal" onClick={() => setDocumento(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <article className="documento-imprimible">
              <header>
                <div>
                  <strong>{documento.emisor.razonSocial}</strong>
                  <p>{documento.emisor.direccionFiscal}</p>
                </div>
                <div className="recuadro">
                  <p>RUC {documento.emisor.ruc}</p>
                  <p>
                    <strong>BOLETA DE VENTA ELECTRÓNICA</strong>
                  </p>
                  <p>{documento.numeroCompleto}</p>
                </div>
              </header>
              <p>
                <strong>Fecha de emisión:</strong> {new Date(documento.fechaEmision).toLocaleString('es-PE')}
              </p>
              <p>
                <strong>Cliente:</strong> {documento.cliente.nombre} — {documento.cliente.tipoDocumento}{' '}
                {documento.cliente.numeroDocumento}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Cant.</th>
                    <th>Descripción</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {documento.items.map((i, k) => (
                    <tr key={k}>
                      <td>{i.cantidad}</td>
                      <td className="ajustar">{i.descripcion}</td>
                      <td>{soles(i.importe)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Op. gravada</td>
                    <td>{soles(documento.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}>IGV (18 %)</td>
                    <td>{soles(documento.igv)}</td>
                  </tr>
                  <tr>
                    <th colSpan={2}>Importe total</th>
                    <th>{soles(documento.total)}</th>
                  </tr>
                </tfoot>
              </table>
              <p className="sutil">
                {documento.descripcionRespuesta} {documento.codigoRespuesta && `(código ${documento.codigoRespuesta})`}
              </p>
            </article>
            <div className="acciones no-imprimir">
              <button className="secundario" onClick={() => setDocumento(null)}>
                Cerrar
              </button>
              <button onClick={() => window.print()}>Imprimir / Guardar PDF</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
