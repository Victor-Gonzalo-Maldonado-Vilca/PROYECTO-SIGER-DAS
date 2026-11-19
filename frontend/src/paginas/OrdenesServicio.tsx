import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';
import EditarOrden from './EditarOrden';

/**
 * INT-001 — Registro de Orden de Servicio (ILA-0001, EDU-0001, CU-TAL-01).
 * BTN-06 Nuevo registro · INP-01 nombres · INP-02 teléfono · INP-03 placa · INP-04 color
 * · INP-05 modelo · SEL-01 tipo de servicio · INP-06 descripción · BTN-01 Guardar
 * · BTN-02 Cancelar · LBL-01 confirmación · LBL-03 estado · MSG-23 a MSG-30.
 */

const VACIO = {
  nombresCliente: '',
  telefono: '',
  documento: '',
  placa: '',
  color: '',
  modelo: '',
  tipoServicio: '',
  descripcion: '',
};
type Formulario = typeof VACIO;

interface FilaOrden {
  id: number;
  nroOrden: string;
  fechaRecepcion: string;
  estado: string;
  tipoServicio: string;
  descripcion: string;
  cliente: string;
  telefono: string | null;
  placa: string | null;
  modelo: string | null;
}

const ESTADO: Record<string, string> = {
  RECEPCIONADO: 'Recepcionado',
  EN_PROCESO: 'En proceso',
  POR_ENTREGAR: 'Por entregar',
  FINALIZADO: 'Finalizado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};
const SERVICIO: Record<string, string> = { MANTENIMIENTO: 'Mantenimiento', REPARACION: 'Reparación' };

export default function OrdenesServicio() {
  const [abierto, setAbierto] = useState(false);
  const [cabecera, setCabecera] = useState<{ nroOrdenReferencial: string; fecha: string } | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [exito, setExito] = useState<{ mensaje: string; nroOrden: string; estado: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ordenes, setOrdenes] = useState<FilaOrden[]>([]);
  const [busqueda, setBusqueda] = useState('');
  // CU-TAL-03: orden en edición (INT-003) y confirmación LBL-01 de la edición
  const [editando, setEditando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const editar = (id: number) => {
    setAbierto(false);
    setExito(null);
    setAviso(null);
    setEditando(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cerrarEdicion = (mensaje?: string) => {
    setEditando(null);
    if (mensaje) {
      setAviso(mensaje);
      void cargar(busqueda.trim());
    }
  };

  const cargar = useCallback(async (q = '') => {
    try {
      setOrdenes((await api.get<FilaOrden[]>('/ordenes', { params: q ? { q } : {} })).data);
    } catch (err) {
      setError(leerErrorApi(err));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // BTN-06 Nuevo registro (paso 2: N.° ORD-AAAA-XXXX y fecha/hora)
  const nuevo = async () => {
    setError(null);
    setExito(null);
    setForm(VACIO);
    try {
      setCabecera((await api.get('/ordenes/proximo-numero')).data);
    } catch {
      setCabecera(null);
    }
    setAbierto(true);
  };

  // BTN-02 Cancelar: descarta sin registrar nada.
  const cancelar = () => {
    setForm(VACIO);
    setError(null);
    setAbierto(false);
  };

  // BTN-01 Guardar
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const r = await api.post<{ mensaje: string; nroOrden: string; estado: string }>('/ordenes', form);
      setExito(r.data); // LBL-01 + LBL-03
      setForm(VACIO); // paso 9: limpia los campos
      setAbierto(false);
      await cargar(busqueda);
    } catch (err) {
      setError(leerErrorApi(err)); // los datos se mantienen para corregirlos
    } finally {
      setGuardando(false);
    }
  };

  const campo = (nombre: keyof Formulario, etiqueta: string, codigo: string, props: Record<string, unknown> = {}) => (
    <label className={error?.campo === nombre ? 'invalido' : ''}>
      {etiqueta} <span className="sutil">({codigo})</span>
      <input
        value={form[nombre]}
        onChange={(e) => setForm({ ...form, [nombre]: e.target.value })}
        aria-invalid={error?.campo === nombre}
        {...props}
      />
    </label>
  );

  return (
    <section>
      <div className="encabezado">
        <h2>Órdenes de servicio</h2>
        {!abierto && editando === null && <button onClick={() => void nuevo()}>Nueva orden</button>}
      </div>

      {aviso && <p className="mensaje exito">{aviso}</p>}
      {editando !== null && <EditarOrden key={editando} ordenId={editando} alCerrar={cerrarEdicion} />}

      {exito && (
        <p className="mensaje exito">
          {exito.mensaje}: <strong>{exito.nroOrden}</strong> · Estado: {ESTADO[exito.estado] ?? exito.estado}
        </p>
      )}

      {abierto && (
        <form className="tarjeta" onSubmit={guardar} noValidate>
          <div className="encabezado">
            <h3>Recepción de motocicleta</h3>
            {cabecera && (
              <span className="sutil">
                N.° {cabecera.nroOrdenReferencial} (referencial) · {new Date(cabecera.fecha).toLocaleString('es-PE')}
              </span>
            )}
          </div>

          <h4 className="subtitulo">Cliente</h4>
          <div className="rejilla">
            {campo('nombresCliente', 'Nombres', 'INP-01', { autoFocus: true, maxLength: 150 })}
            {campo('telefono', 'Teléfono', 'INP-02', { inputMode: 'tel', placeholder: '959123456' })}
            {campo('documento', 'DNI / RUC (opcional)', 'no figura en INT-001', { inputMode: 'numeric', maxLength: 11 })}
          </div>

          <h4 className="subtitulo">Motocicleta</h4>
          <div className="rejilla">
            {campo('placa', 'Placa', 'INP-03', { placeholder: '1234-AB', style: { textTransform: 'uppercase' } })}
            {campo('color', 'Color (opcional)', 'INP-04', { maxLength: 30 })}
            {campo('modelo', 'Modelo (opcional)', 'INP-05', { maxLength: 50 })}
          </div>

          <h4 className="subtitulo">Servicio</h4>
          <div className="rejilla">
            <label className={error?.campo === 'tipoServicio' ? 'invalido' : ''}>
              Tipo de servicio <span className="sutil">(SEL-01)</span>
              <select value={form.tipoServicio} onChange={(e) => setForm({ ...form, tipoServicio: e.target.value })}>
                <option value="">Seleccione…</option>
                <option value="MANTENIMIENTO">Mantenimiento</option>
                <option value="REPARACION">Reparación</option>
              </select>
            </label>
          </div>
          <label className={`ancho ${error?.campo === 'descripcion' ? 'invalido' : ''}`}>
            Descripción de la falla o requerimiento <span className="sutil">(INP-06)</span>
            <textarea
              rows={3}
              maxLength={500}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </label>

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
      )}

      <div className="tarjeta">
        <div className="encabezado">
          <h3>Órdenes registradas</h3>
          <form
            className="busqueda"
            onSubmit={(e) => {
              e.preventDefault();
              void cargar(busqueda.trim());
            }}
          >
            <input placeholder="N.° de orden, placa o cliente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <button type="submit" className="secundario">
              Buscar
            </button>
          </form>
        </div>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>N.° orden</th>
                <th>Recepción</th>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Placa</th>
                <th>Servicio</th>
                <th>Descripción</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordenes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="sutil">
                    No hay órdenes para el criterio ingresado.
                  </td>
                </tr>
              ) : (
                ordenes.map((o) => (
                  <tr key={o.id}>
                    <td>{o.nroOrden}</td>
                    <td>{new Date(o.fechaRecepcion).toLocaleString('es-PE')}</td>
                    <td>{o.cliente}</td>
                    <td>{o.telefono ?? '—'}</td>
                    <td>{o.placa ?? '—'}</td>
                    <td>{SERVICIO[o.tipoServicio] ?? o.tipoServicio}</td>
                    <td className="ajustar">{o.descripcion}</td>
                    <td>
                      <span className={`estado ${o.estado}`}>{ESTADO[o.estado] ?? o.estado}</span>
                    </td>
                    <td>
                      {/* BTN-03 Editar (las órdenes Entregado/Cancelado se abren en solo lectura) */}
                      <button className="secundario" onClick={() => editar(o.id)}>
                        {o.estado === 'ENTREGADO' || o.estado === 'CANCELADO' ? 'Ver' : 'Editar'}
                      </button>
                    </td>
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
