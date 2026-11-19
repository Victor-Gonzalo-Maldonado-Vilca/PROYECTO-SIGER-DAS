import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';
import { PanelFirma, type PanelFirmaRef } from '../componentes/PanelFirma';

/**
 * INT-075 — Registro de Conformidad de Servicio (ILA-0075, EDU-0019).
 * SEL-04 órdenes aptas · TBL-05 cliente · TBL-06 vehículo · TBL-07 servicios
 * · PAD-01 firma · BTN-01 Guardar · BTN-02 Cancelar · LBL-01 / LBL-02.
 */

interface OrdenApta {
  id: number;
  nroOrden: string;
  estado: string;
  placa: string | null;
  cliente: string;
}

interface Resumen {
  orden: { id: number; nroOrden: string; estado: string; tipoServicio: string; descripcion: string };
  cliente: { tipoDocumento: string; numeroDocumento: string; nombre: string; telefono: string | null };
  vehiculo: { placa: string | null; marca: string; modelo: string; anio: number; color: string };
  servicios: Array<{ tipoItem: string; descripcion: string; cantidad: number; subtotal: number }>;
  precioTotal: number;
}

interface FilaConformidad {
  id: number;
  nroConformidad: string;
  fechaEmision: string;
  nroOrden: string;
  placa: string | null;
  cliente: string;
  kilometraje: number;
  precioTotal: number;
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const ESTADO: Record<string, string> = { EN_PROCESO: 'En proceso', POR_ENTREGAR: 'Por entregar' };

export default function Conformidades() {
  const [aptas, setAptas] = useState<OrdenApta[]>([]);
  const [ordenId, setOrdenId] = useState('');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [kilometraje, setKilometraje] = useState('');
  const [tieneFirma, setTieneFirma] = useState(false);
  const firma = useRef<PanelFirmaRef>(null);

  const [error, setError] = useState<ErrorApi | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [registradas, setRegistradas] = useState<FilaConformidad[]>([]);

  const cargarListas = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([
        api.get<OrdenApta[]>('/conformidades/ordenes-aptas'),
        api.get<FilaConformidad[]>('/conformidades'),
      ]);
      setAptas(a.data);
      setRegistradas(r.data);
    } catch (err) {
      setError(leerErrorApi(err));
    }
  }, []);

  useEffect(() => {
    void cargarListas();
  }, [cargarListas]);

  // Pasos 4 y 5: al seleccionar la orden se cargan TBL-05/06/07 en solo lectura.
  const seleccionar = async (id: string) => {
    setOrdenId(id);
    setResumen(null);
    setError(null);
    setExito(null);
    if (!id) return;
    try {
      setResumen((await api.get<Resumen>(`/conformidades/ordenes/${id}`)).data);
    } catch (err) {
      setError(leerErrorApi(err));
    }
  };

  const limpiarFormulario = () => {
    setOrdenId('');
    setResumen(null);
    setKilometraje('');
    firma.current?.limpiar();
  };

  // BTN-02: descarta la firma de la memoria temporal sin cambios en la BD.
  const cancelar = () => {
    limpiarFormulario();
    setError(null);
  };

  // BTN-01
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    setGuardando(true);
    try {
      const r = await api.post<{ mensaje: string; nroConformidad: string }>('/conformidades', {
        ordenId: ordenId ? Number(ordenId) : undefined,
        kilometraje: kilometraje === '' ? undefined : Number(kilometraje),
        firma: firma.current?.obtenerFirma() ?? undefined,
      });
      setExito(`${r.data.mensaje}: ${r.data.nroConformidad}.`); // LBL-01
      limpiarFormulario(); // paso 12
      await cargarListas();
    } catch (err) {
      setError(leerErrorApi(err)); // LBL-02 con MSG-05
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section>
      <div className="encabezado">
        <h2>Conformidad de servicio</h2>
      </div>

      {exito && <p className="mensaje exito">{exito}</p>}

      <form className="tarjeta" onSubmit={guardar} noValidate>
        <label className={error?.campo === 'ordenId' ? 'invalido' : ''}>
          Orden de servicio <span className="sutil">(SEL-04)</span>
          <select value={ordenId} onChange={(e) => void seleccionar(e.target.value)}>
            <option value="">
              {aptas.length ? 'Seleccione una orden apta…' : 'No hay órdenes aptas para conformidad'}
            </option>
            {aptas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nroOrden} · {o.placa ?? 'sin placa'} · {o.cliente} · {ESTADO[o.estado] ?? o.estado}
              </option>
            ))}
          </select>
        </label>

        {resumen && (
          <div className="resumen">
            <div>
              <h4>Cliente <span className="sutil">(TBL-05)</span></h4>
              <p>{resumen.cliente.nombre}</p>
              <p className="sutil">
                {resumen.cliente.tipoDocumento} {resumen.cliente.numeroDocumento}
                {resumen.cliente.telefono ? ` · ${resumen.cliente.telefono}` : ''}
              </p>
            </div>
            <div>
              <h4>Vehículo <span className="sutil">(TBL-06)</span></h4>
              <p>
                {resumen.vehiculo.marca} {resumen.vehiculo.modelo} {resumen.vehiculo.anio}
              </p>
              <p className="sutil">
                Placa {resumen.vehiculo.placa ?? '—'} · {resumen.vehiculo.color}
              </p>
            </div>
            <div className="ancho-completo">
              <h4>
                Servicios e insumos <span className="sutil">(TBL-07)</span>
              </h4>
              <p className="sutil">{resumen.orden.descripcion}</p>
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Cant.</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.servicios.map((s, i) => (
                    <tr key={i}>
                      <td>{s.tipoItem === 'SERVICIO' ? 'Servicio' : 'Insumo'}</td>
                      <td>{s.descripcion}</td>
                      <td>{s.cantidad}</td>
                      <td>{soles(s.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Precio total</th>
                    <th>{soles(resumen.precioTotal)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="rejilla">
          <label className={error?.campo === 'kilometraje' ? 'invalido' : ''}>
            Kilometraje
            <input
              type="number"
              min={0}
              step={1}
              value={kilometraje}
              onChange={(e) => setKilometraje(e.target.value)}
            />
          </label>
        </div>

        <div className={`campo-firma ${error?.campo === 'firma' ? 'invalido' : ''}`}>
          <div className="encabezado">
            <strong>
              Firma del cliente <span className="sutil">(PAD-01)</span>
            </strong>
            <button type="button" className="secundario" onClick={() => firma.current?.limpiar()} disabled={!tieneFirma}>
              Limpiar firma
            </button>
          </div>
          <PanelFirma ref={firma} alCambiar={setTieneFirma} />
        </div>

        {error && (
          <p className="mensaje error">
            {error.codigo && <strong>{error.codigo}: </strong>}
            {error.mensaje}
          </p>
        )}

        <div className="acciones">
          <button type="button" className="secundario" onClick={cancelar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>

      <div className="tarjeta">
        <h3>Conformidades registradas</h3>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>N.° conformidad</th>
                <th>Fecha</th>
                <th>Orden</th>
                <th>Placa</th>
                <th>Cliente</th>
                <th>Km</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {registradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="sutil">
                    Aún no hay conformidades.
                  </td>
                </tr>
              ) : (
                registradas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nroConformidad}</td>
                    <td>{new Date(c.fechaEmision).toLocaleString('es-PE')}</td>
                    <td>{c.nroOrden}</td>
                    <td>{c.placa ?? '—'}</td>
                    <td>{c.cliente}</td>
                    <td>{c.kilometraje.toLocaleString('es-PE')}</td>
                    <td>{soles(c.precioTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
