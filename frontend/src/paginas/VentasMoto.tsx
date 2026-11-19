import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';
import type { EstadoVenta, FilaVentaMoto } from '../tipos';

/**
 * INT-012 — Gestión de Venta de Motos (EDU-0004).
 * Formulario de ILA-0012 (INP-30 a INP-35, BTN-01 Guardar, BTN-02 Cancelar)
 * y listado de ventas TBL-12.
 */

const VACIO = { marca: '', modelo: '', anio: '', color: '', numeroMotor: '', numeroChasis: '' };
type Formulario = typeof VACIO;

const CAMPOS: Array<{ campo: keyof Formulario; id: string; etiqueta: string; tipo?: string }> = [
  { campo: 'marca', id: 'INP-30', etiqueta: 'Marca' },
  { campo: 'modelo', id: 'INP-31', etiqueta: 'Modelo' },
  { campo: 'anio', id: 'INP-32', etiqueta: 'Año', tipo: 'number' },
  { campo: 'color', id: 'INP-33', etiqueta: 'Color' },
  { campo: 'numeroMotor', id: 'INP-34', etiqueta: 'N.° de motor' },
  { campo: 'numeroChasis', id: 'INP-35', etiqueta: 'N.° de chasis' },
];

const ETIQUETA_ESTADO: Record<EstadoVenta, string> = {
  SIN_CLIENTE: 'Sin cliente',
  CON_CLIENTE: 'Con cliente',
  COMPROBANTE_EMITIDO: 'Comprobante emitido',
};

export default function VentasMoto() {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [ventas, setVentas] = useState<FilaVentaMoto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [errorListado, setErrorListado] = useState<string | null>(null);

  const cargarVentas = useCallback(async (texto = '') => {
    try {
      const r = await api.get<FilaVentaMoto[]>('/ventas-moto', { params: texto ? { q: texto } : {} });
      setVentas(r.data);
      setErrorListado(null);
    } catch (err) {
      setErrorListado(leerErrorApi(err).mensaje);
    }
  }, []);

  useEffect(() => {
    void cargarVentas();
  }, [cargarVentas]);

  // BTN-02 Cancelar: descarta los datos sin registrar nada.
  const cancelar = () => {
    setForm(VACIO);
    setError(null);
    setMostrarFormulario(false);
  };

  // BTN-01 Guardar
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    setGuardando(true);
    try {
      const r = await api.post<{ mensaje: string; nroVenta: string }>('/ventas-moto', {
        ...form,
        anio: form.anio === '' ? '' : Number(form.anio),
      });
      setExito(`${r.data.mensaje} (${r.data.nroVenta}).`); // MSG-48
      setForm(VACIO);
      setMostrarFormulario(false);
      await cargarVentas(busqueda); // paso 9: actualiza TBL-12
    } catch (err) {
      setError(leerErrorApi(err)); // MSG-45 / MSG-46 / MSG-47: el usuario corrige y reintenta
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section>
      <div className="encabezado">
        <h2>Venta de motos</h2>
        {!mostrarFormulario && (
          <button
            onClick={() => {
              setExito(null);
              setMostrarFormulario(true);
            }}
          >
            Registrar venta
          </button>
        )}
      </div>

      {exito && <p className="mensaje exito">{exito}</p>}

      {mostrarFormulario && (
        <form className="tarjeta" onSubmit={guardar} noValidate>
          <h3>Datos de la moto vendida</h3>
          <div className="rejilla">
            {CAMPOS.map(({ campo, id, etiqueta, tipo }) => (
              <label key={campo} className={error?.campo === campo ? 'invalido' : ''}>
                {etiqueta} <span className="sutil">({id})</span>
                <input
                  type={tipo ?? 'text'}
                  value={form[campo]}
                  onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  aria-invalid={error?.campo === campo}
                />
              </label>
            ))}
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
      )}

      <div className="tarjeta">
        <div className="encabezado">
          <h3>Ventas registradas</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void cargarVentas(busqueda);
            }}
          >
            <input
              placeholder="Buscar por N.° venta, marca, modelo, motor o chasis"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </form>
        </div>
        {errorListado && <p className="mensaje error">{errorListado}</p>}
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>N.° venta</th>
                <th>Fecha</th>
                <th>Marca / Modelo</th>
                <th>Año</th>
                <th>Color</th>
                <th>N.° motor</th>
                <th>N.° chasis</th>
                <th>Cliente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="sutil">
                    No hay ventas registradas.
                  </td>
                </tr>
              ) : (
                ventas.map((v) => (
                  <tr key={v.id}>
                    <td>{v.nroVenta}</td>
                    <td>{new Date(v.fecha).toLocaleString('es-PE')}</td>
                    <td>
                      {v.marca} {v.modelo}
                    </td>
                    <td>{v.anio}</td>
                    <td>{v.color}</td>
                    <td>{v.numeroMotor}</td>
                    <td>{v.numeroChasis}</td>
                    <td>{v.cliente ?? '—'}</td>
                    <td>
                      <span className={`estado ${v.estado}`}>{ETIQUETA_ESTADO[v.estado]}</span>
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
