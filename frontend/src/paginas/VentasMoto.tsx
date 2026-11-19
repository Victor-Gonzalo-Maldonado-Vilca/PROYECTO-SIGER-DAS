import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';
import { AsociarCliente } from '../componentes/AsociarCliente';
import type { EstadoVenta, FilaVentaMoto, Usuario } from '../tipos';

/**
 * INT-012 — Gestión de Venta de Motos (EDU-0004).
 * Formulario de ILA-0012 (INP-30 a INP-35, BTN-01 Guardar, BTN-02 Cancelar)
 * y listado de ventas TBL-12.
 */

const VACIO = { marca: '', modelo: '', anio: '', color: '', numeroMotor: '', numeroChasis: '', precio: '' };
type Formulario = typeof VACIO;

const CAMPOS: Array<{ campo: keyof Formulario; id: string; etiqueta: string; tipo?: string; ayuda?: string }> = [
  { campo: 'marca', id: 'INP-30', etiqueta: 'Marca' },
  { campo: 'modelo', id: 'INP-31', etiqueta: 'Modelo' },
  { campo: 'anio', id: 'INP-32', etiqueta: 'Año', tipo: 'number' },
  { campo: 'color', id: 'INP-33', etiqueta: 'Color' },
  { campo: 'numeroMotor', id: 'INP-34', etiqueta: 'N.° de motor' },
  { campo: 'numeroChasis', id: 'INP-35', etiqueta: 'N.° de chasis' },
  // Adición al catálogo: ILA-0012 no lo pide, pero la boleta (ILA-0018) necesita el monto.
  { campo: 'precio', id: 'nuevo', etiqueta: 'Precio de venta (S/, IGV incluido)', ayuda: 'Ej.: 5490.00' },
];

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ETIQUETA_ESTADO: Record<EstadoVenta, string> = {
  SIN_CLIENTE: 'Sin cliente',
  CON_CLIENTE: 'Con cliente',
  COMPROBANTE_EMITIDO: 'Comprobante emitido',
};

export default function VentasMoto({ usuario }: { usuario?: Usuario }) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  // CU-VEN-08: venta en edición (null = registro nuevo). Solo el Gerente puede editar.
  const [editando, setEditando] = useState<FilaVentaMoto | null>(null);
  const puedeEditar = usuario?.rol === 'GERENTE';
  const [form, setForm] = useState<Formulario>(VACIO);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [ventas, setVentas] = useState<FilaVentaMoto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [errorListado, setErrorListado] = useState<string | null>(null);
  // ILA-0017: filtro de ventas pendientes de asociación y venta seleccionada (BTN-23)
  const [soloSinCliente, setSoloSinCliente] = useState(false);
  const [asociando, setAsociando] = useState<FilaVentaMoto | null>(null);

  const cargarVentas = useCallback(
    async (texto = '') => {
      try {
        const params: Record<string, string> = {};
        if (texto) params.q = texto;
        if (soloSinCliente) params.sinCliente = '1';
        const r = await api.get<FilaVentaMoto[]>('/ventas-moto', { params });
        setVentas(r.data);
        setErrorListado(null);
      } catch (err) {
        setErrorListado(leerErrorApi(err).mensaje);
      }
    },
    [soloSinCliente],
  );

  useEffect(() => {
    void cargarVentas(busqueda.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarVentas]);

  const terminarAsociacion = (mensaje?: string) => {
    setAsociando(null);
    if (mensaje) {
      setExito(mensaje); // MSG-58
      void cargarVentas(busqueda.trim()); // paso 9: refresca TBL-18
    }
  };

  // BTN-02 Cancelar: descarta los datos sin registrar nada.
  const cancelar = () => {
    setForm(VACIO);
    setError(null);
    setEditando(null);
    setMostrarFormulario(false);
  };

  // CU-VEN-08 BTN-25 Editar: precarga INP-30 a INP-35 y el precio.
  const abrirEdicion = (v: FilaVentaMoto) => {
    setAsociando(null);
    setExito(null);
    setError(null);
    setEditando(v);
    setForm({
      marca: v.marca,
      modelo: v.modelo,
      anio: String(v.anio),
      color: v.color,
      numeroMotor: v.numeroMotor,
      numeroChasis: v.numeroChasis,
      precio: v.precio == null ? '' : v.precio.toFixed(2),
    });
    setMostrarFormulario(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // BTN-01 Guardar (registro) / BTN-40 Guardar cambios (edición)
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    setGuardando(true);
    const datos = { ...form, anio: form.anio === '' ? '' : Number(form.anio) };
    try {
      const r = editando
        ? await api.put<{ mensaje: string; nroVenta: string }>(`/ventas-moto/${editando.id}`, {
            ...datos,
            version: editando.version,
          })
        : await api.post<{ mensaje: string; nroVenta: string }>('/ventas-moto', datos);
      setExito(`${r.data.mensaje} (${r.data.nroVenta}).`); // MSG-48 / MSG-52
      setEditando(null);
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
          <h3>{editando ? `Editar venta ${editando.nroVenta}` : 'Datos de la moto vendida'}</h3>
          <div className="rejilla">
            {CAMPOS.map(({ campo, id, etiqueta, tipo, ayuda }) => (
              <label key={campo} className={error?.campo === campo ? 'invalido' : ''}>
                {etiqueta} <span className="sutil">({id})</span>
                <input
                  type={tipo ?? 'text'}
                  placeholder={ayuda}
                  inputMode={campo === 'precio' ? 'decimal' : undefined}
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
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {asociando && <AsociarCliente key={asociando.id} venta={asociando} alTerminar={terminarAsociacion} />}

      <div className="tarjeta">
        <div className="encabezado">
          <h3>{soloSinCliente ? 'Ventas pendientes de asociar cliente' : 'Ventas registradas'}</h3>
          <form
            className="busqueda"
            onSubmit={(e) => {
              e.preventDefault();
              void cargarVentas(busqueda.trim());
            }}
          >
            <input
              placeholder="N.° venta, marca, modelo, motor, chasis o cliente"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <label className="casilla">
              <input type="checkbox" checked={soloSinCliente} onChange={(e) => setSoloSinCliente(e.target.checked)} />
              Solo sin cliente
            </label>
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
                <th>Precio</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={11} className="sutil">
                    {soloSinCliente
                      ? 'MSG-56: No existen ventas pendientes de asociación de cliente en el sistema.'
                      : 'No hay ventas registradas.'}
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
                    <td title={v.precio == null ? 'Venta registrada antes de capturar el precio: no se puede facturar' : ''}>
                      {v.precio == null ? <span className="sutil">Sin precio</span> : soles(v.precio)}
                    </td>
                    <td>{v.cliente ?? '—'}</td>
                    <td>
                      <span className={`estado ${v.estado}`}>{ETIQUETA_ESTADO[v.estado]}</span>
                    </td>
                    <td>
                      {/* CU-VEN-08 BTN-25 Editar: solo Gerente y sin comprobante (RN-VEN-12) */}
                      {puedeEditar && v.estado !== 'COMPROBANTE_EMITIDO' && (
                        <button
                          className="secundario"
                          disabled={mostrarFormulario || asociando !== null}
                          onClick={() => abrirEdicion(v)}
                        >
                          Editar
                        </button>
                      )}
                      {/* BTN-23 Asociar cliente */}
                      {v.estado === 'SIN_CLIENTE' && (
                        <button
                          className="secundario"
                          disabled={asociando !== null}
                          onClick={() => {
                            setExito(null);
                            setAsociando(v);
                          }}
                        >
                          Asociar cliente
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
    </section>
  );
}
