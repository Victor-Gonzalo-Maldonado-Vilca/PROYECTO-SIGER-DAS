import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';
import type { Cliente, EstadoCliente, HistorialCliente, Usuario } from '../tipos';

/**
 * MOD-05 Clientes (EDU-0020).
 *  - INT-051 / TBL-12: padrón con INP-01 (DNI, RUC o nombre), SEL-01 (estado) y BTN-13 Buscar (CU-CLI-02).
 *  - INT-050 / INT-052: formulario de registro (CU-CLI-01) y edición (CU-CLI-03).
 *  - BTN-05 Ver detalle (solo lectura, RN-CLI-03), BTN-08 Ver historial (CU-CLI-05, INT-055).
 *  - BTN-04 Inhabilitar con confirmación LBL-04 (CU-CLI-04, solo Gerente).
 */

const VACIO = { tipoDocumento: 'DNI', numeroDocumento: '', nombre: '', telefono: '', correo: '', direccion: '' };
type Formulario = typeof VACIO;

const ETIQUETA_ESTADO: Record<EstadoCliente, string> = { ACTIVO: 'Activo', INACTIVO: 'Inactivo' };
const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE');
const legible = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

type Pestana = 'vehiculos' | 'ordenes' | 'proformas' | 'comprobantes';
const PESTANAS: Array<{ clave: Pestana; titulo: string }> = [
  { clave: 'vehiculos', titulo: 'Vehículos' },
  { clave: 'ordenes', titulo: 'Mantenimientos / Reparaciones' },
  { clave: 'proformas', titulo: 'Proformas' },
  { clave: 'comprobantes', titulo: 'Comprobantes' },
];

export default function Clientes({ usuario }: { usuario?: Usuario }) {
  const esGerente = usuario?.rol === 'GERENTE';

  // TBL-12 y filtros
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'' | EstadoCliente>('ACTIVO');
  const [errorListado, setErrorListado] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  // Formulario (registro o edición)
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  // Modales
  const [detalle, setDetalle] = useState<Cliente | null>(null);
  const [historial, setHistorial] = useState<HistorialCliente | null>(null);
  const [pestana, setPestana] = useState<Pestana>('vehiculos');
  const [confirmando, setConfirmando] = useState<{ cliente: Cliente; accion: 'inhabilitar' | 'reactivar' } | null>(
    null,
  );
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const cargar = useCallback(async (texto: string, estado: '' | EstadoCliente) => {
    try {
      const params: Record<string, string> = {};
      if (texto) params.q = texto;
      if (estado) params.estado = estado;
      const r = await api.get<Cliente[]>('/clientes', { params });
      setClientes(r.data);
      setErrorListado(null);
    } catch (err) {
      setErrorListado(leerErrorApi(err).mensaje);
    } finally {
      setCargado(true);
    }
  }, []);

  useEffect(() => {
    void cargar(busqueda.trim(), filtroEstado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar, filtroEstado]);

  const recargar = () => cargar(busqueda.trim(), filtroEstado);

  const abrirRegistro = () => {
    setExito(null);
    setError(null);
    setEditando(null);
    setForm(VACIO);
    setMostrarFormulario(true);
  };

  // BTN-03 Editar: carga los datos vigentes (INT-052)
  const abrirEdicion = (c: Cliente) => {
    setExito(null);
    setError(null);
    setEditando(c);
    setForm({
      tipoDocumento: c.tipoDocumento ?? 'DNI',
      numeroDocumento: c.numeroDocumento ?? '',
      nombre: c.nombre,
      telefono: c.telefono ?? '',
      correo: c.correo ?? '',
      direccion: c.direccion ?? '',
    });
    setMostrarFormulario(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // BTN-02 Cancelar: descarta los datos sin tocar la base de datos.
  const cancelar = () => {
    setForm(VACIO);
    setError(null);
    setEditando(null);
    setMostrarFormulario(false);
  };

  // BTN-01 Guardar / Guardar cambios
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);
    setGuardando(true);
    // En edición, un cliente del taller sin documento puede seguir sin él si se deja vacío.
    const datos = { ...form, tipoDocumento: form.numeroDocumento.trim() ? form.tipoDocumento : '' };
    try {
      const r = editando
        ? await api.put<{ mensaje: string }>(`/clientes/${editando.id}`, { ...datos, version: editando.version })
        : await api.post<{ mensaje: string }>('/clientes', datos);
      setExito(r.data.mensaje); // MSG-101 / MSG-104
      cancelar();
      await recargar();
    } catch (err) {
      setError(leerErrorApi(err)); // MSG-102, validaciones o conflicto de versión
    } finally {
      setGuardando(false);
    }
  };

  // BTN-05 Ver detalle (lectura fresca del servidor)
  const verDetalle = async (c: Cliente) => {
    try {
      setDetalle((await api.get<Cliente>(`/clientes/${c.id}`)).data);
    } catch (err) {
      setErrorListado(leerErrorApi(err).mensaje);
    }
  };

  // BTN-08 Ver historial (INT-055)
  const verHistorial = async (c: Cliente) => {
    try {
      setPestana('vehiculos');
      setHistorial((await api.get<HistorialCliente>(`/clientes/${c.id}/historial`)).data);
    } catch (err) {
      setErrorListado(leerErrorApi(err).mensaje);
    }
  };

  // LBL-04: confirmación de la baja lógica (o de la reactivación)
  const confirmarCambioEstado = async () => {
    if (!confirmando) return;
    setErrorAccion(null);
    try {
      const { cliente, accion } = confirmando;
      const r = await api.post<{ mensaje: string }>(`/clientes/${cliente.id}/${accion}`, { version: cliente.version });
      setConfirmando(null);
      setExito(r.data.mensaje); // MSG-105
      await recargar();
    } catch (err) {
      const e = leerErrorApi(err);
      setErrorAccion(e.codigo ? `${e.codigo}: ${e.mensaje}` : e.mensaje); // MSG-106
    }
  };

  const esRuc = form.tipoDocumento === 'RUC';
  const sinDocumentoPrevio = editando !== null && editando.numeroDocumento === null;

  return (
    <section>
      <div className="encabezado">
        <h2>Clientes</h2>
        {!mostrarFormulario && <button onClick={abrirRegistro}>Registrar cliente</button>}
      </div>

      {exito && <p className="mensaje exito">{exito}</p>}

      {mostrarFormulario && (
        <form className="tarjeta" onSubmit={guardar} noValidate>
          <h3>{editando ? `Editar cliente ${editando.nombre}` : 'Nuevo cliente'}</h3>
          {sinDocumentoPrevio && (
            <p className="aviso">
              Este cliente se registró en el taller sin documento. Complete su DNI o RUC para poder venderle una moto o
              emitirle un comprobante.
            </p>
          )}
          <div className="rejilla">
            <label className={error?.campo === 'tipoDocumento' ? 'invalido' : ''}>
              Tipo de documento
              <select
                value={form.tipoDocumento}
                onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value })}
              >
                <option value="DNI">DNI (persona natural)</option>
                <option value="RUC">RUC (persona jurídica)</option>
              </select>
            </label>
            <label className={error?.campo === 'numeroDocumento' ? 'invalido' : ''}>
              N.° de documento
              <input
                inputMode="numeric"
                maxLength={11}
                placeholder={esRuc ? '11 dígitos' : '8 dígitos'}
                value={form.numeroDocumento}
                onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })}
                aria-invalid={error?.campo === 'numeroDocumento'}
              />
            </label>
            <label className={error?.campo === 'nombre' ? 'invalido' : ''}>
              {esRuc ? 'Razón social' : 'Nombres y apellidos'}
              <input
                maxLength={150}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                aria-invalid={error?.campo === 'nombre'}
              />
            </label>
            <label className={error?.campo === 'telefono' ? 'invalido' : ''}>
              <span>
                Teléfono / celular <span className="sutil">(opcional)</span>
              </span>
              <input
                inputMode="tel"
                placeholder="9XXXXXXXX"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                aria-invalid={error?.campo === 'telefono'}
              />
            </label>
            <label className={error?.campo === 'correo' ? 'invalido' : ''}>
              <span>
                Correo electrónico <span className="sutil">(opcional)</span>
              </span>
              <input
                type="email"
                maxLength={100}
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
                aria-invalid={error?.campo === 'correo'}
              />
            </label>
            <label className={error?.campo === 'direccion' ? 'invalido' : ''}>
              <span>
                {esRuc ? 'Dirección fiscal' : 'Dirección domiciliaria'} <span className="sutil">(opcional)</span>
              </span>
              <input
                maxLength={200}
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                aria-invalid={error?.campo === 'direccion'}
              />
            </label>
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

      <div className="tarjeta">
        <div className="encabezado">
          <h3>Padrón de clientes</h3>
          <form
            className="busqueda"
            onSubmit={(e) => {
              e.preventDefault();
              void recargar();
            }}
          >
            <input
              placeholder="DNI, RUC, nombre o teléfono"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as '' | EstadoCliente)}>
              <option value="ACTIVO">Activos</option>
              <option value="INACTIVO">Inactivos</option>
              <option value="">Todos</option>
            </select>
            <button type="submit">Buscar</button>
          </form>
        </div>
        {errorListado && <p className="mensaje error">{errorListado}</p>}
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombres / Razón social</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sutil">
                    {cargado ? 'MSG-103: No se encontraron clientes que coincidan con la búsqueda.' : 'Cargando…'}
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.numeroDocumento ? (
                        <>
                          <span className="sutil">{c.tipoDocumento}</span> {c.numeroDocumento}
                        </>
                      ) : (
                        <span className="sutil" title="Registrado en el taller sin documento">
                          Sin documento
                        </span>
                      )}
                    </td>
                    <td>{c.nombre}</td>
                    <td>{c.telefono ?? '—'}</td>
                    <td>{c.correo ?? '—'}</td>
                    <td>
                      <span className={`estado ${c.estado}`}>{ETIQUETA_ESTADO[c.estado]}</span>
                    </td>
                    <td>
                      <button className="secundario" onClick={() => void verDetalle(c)}>
                        Ver detalle
                      </button>
                      <button className="secundario" onClick={() => void verHistorial(c)}>
                        Historial
                      </button>
                      <button className="secundario" disabled={mostrarFormulario} onClick={() => abrirEdicion(c)}>
                        Editar
                      </button>
                      {esGerente && (
                        <button
                          className="secundario"
                          onClick={() => {
                            setErrorAccion(null);
                            setConfirmando({ cliente: c, accion: c.estado === 'ACTIVO' ? 'inhabilitar' : 'reactivar' });
                          }}
                        >
                          {c.estado === 'ACTIVO' ? 'Inhabilitar' : 'Reactivar'}
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

      {/* INT_051_DETALLE: solo lectura (RN-CLI-03) */}
      {detalle && (
        <div className="fondo-modal" onClick={() => setDetalle(null)}>
          <div className="modal" role="dialog" aria-label="Detalle del cliente" onClick={(e) => e.stopPropagation()}>
            <h3>Ficha del cliente</h3>
            <dl className="ficha">
              <dt>Documento</dt>
              <dd>{detalle.numeroDocumento ? `${detalle.tipoDocumento} ${detalle.numeroDocumento}` : 'Sin documento'}</dd>
              <dt>{detalle.tipoDocumento === 'RUC' ? 'Razón social' : 'Nombres y apellidos'}</dt>
              <dd>{detalle.nombre}</dd>
              <dt>Teléfono</dt>
              <dd>{detalle.telefono ?? '—'}</dd>
              <dt>Correo</dt>
              <dd>{detalle.correo ?? '—'}</dd>
              <dt>Dirección</dt>
              <dd>{detalle.direccion ?? '—'}</dd>
              <dt>Estado</dt>
              <dd>
                <span className={`estado ${detalle.estado}`}>{ETIQUETA_ESTADO[detalle.estado]}</span>
              </dd>
              <dt>Registrado el</dt>
              <dd>{fecha(detalle.fechaRegistro)}</dd>
            </dl>
            <div className="acciones">
              <button onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* INT-055: historial vehicular y comercial (CU-CLI-05) */}
      {historial && (
        <div className="fondo-modal" onClick={() => setHistorial(null)}>
          <div className="modal amplio" role="dialog" aria-label="Historial del cliente" onClick={(e) => e.stopPropagation()}>
            <h3>
              Historial de {historial.cliente.nombre}{' '}
              <span className={`estado ${historial.cliente.estado}`}>{ETIQUETA_ESTADO[historial.cliente.estado]}</span>
            </h3>
            <div className="pestanas-internas">
              {PESTANAS.map((p) => (
                <button
                  key={p.clave}
                  className={p.clave === pestana ? '' : 'secundario'}
                  onClick={() => setPestana(p.clave)}
                >
                  {p.titulo} ({historial[p.clave].length})
                </button>
              ))}
            </div>
            <div className="tabla-scroll">
              <TablaHistorial historial={historial} pestana={pestana} />
            </div>
            <div className="acciones">
              <button onClick={() => setHistorial(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* LBL-04: confirmación de la baja lógica */}
      {confirmando && (
        <div className="fondo-modal" onClick={() => setConfirmando(null)}>
          <div className="modal" role="dialog" aria-label="Confirmar" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmando.accion === 'inhabilitar' ? 'Inhabilitar cliente' : 'Reactivar cliente'}</h3>
            <p>
              {confirmando.accion === 'inhabilitar'
                ? `¿Confirma la baja lógica de ${confirmando.cliente.nombre}? No podrá asociarse a nuevas ventas ni órdenes de servicio, pero su historial se conserva.`
                : `¿Reactivar a ${confirmando.cliente.nombre}? Podrá volver a asociarse a ventas y órdenes de servicio.`}
            </p>
            {errorAccion && <p className="mensaje error">{errorAccion}</p>}
            <div className="acciones">
              <button className="secundario" onClick={() => setConfirmando(null)}>
                Cancelar
              </button>
              <button onClick={() => void confirmarCambioEstado()}>
                {confirmando.accion === 'inhabilitar' ? 'Confirmar inhabilitación' : 'Confirmar reactivación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TablaHistorial({ historial, pestana }: { historial: HistorialCliente; pestana: Pestana }) {
  const vacio = <p className="aviso">No se registran operaciones en este rubro.</p>;

  if (pestana === 'vehiculos') {
    if (historial.vehiculos.length === 0) return vacio;
    return (
      <table>
        <thead>
          <tr>
            <th>Placa</th>
            <th>Marca / Modelo</th>
            <th>Año</th>
            <th>Color</th>
            <th>Origen</th>
          </tr>
        </thead>
        <tbody>
          {historial.vehiculos.map((v) => (
            <tr key={v.motoId}>
              <td>{v.placa ?? <span className="sutil">Sin placa</span>}</td>
              <td>{[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}</td>
              <td>{v.anio ?? '—'}</td>
              <td>{v.color ?? '—'}</td>
              <td>
                {v.origen === 'COMPRA'
                  ? `Comprada (${v.nroVenta}${v.fechaVenta ? `, ${fecha(v.fechaVenta)}` : ''})`
                  : 'Atendida en el taller'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (pestana === 'ordenes') {
    if (historial.ordenes.length === 0) return vacio;
    return (
      <table>
        <thead>
          <tr>
            <th>N.° orden</th>
            <th>Fecha</th>
            <th>Placa</th>
            <th>Tipo</th>
            <th>Descripción</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {historial.ordenes.map((o) => (
            <tr key={o.id}>
              <td>{o.nroOrden}</td>
              <td>{fecha(o.fechaRecepcion)}</td>
              <td>{o.placa ?? '—'}</td>
              <td>{legible(o.tipoServicio)}</td>
              <td className="ajustar">{o.descripcion}</td>
              <td>
                <span className={`estado ${o.estado}`}>{legible(o.estado)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (pestana === 'proformas') {
    if (historial.proformas.length === 0) return vacio;
    return (
      <table>
        <thead>
          <tr>
            <th>N.°</th>
            <th>Fecha</th>
            <th>Orden</th>
            <th>Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {historial.proformas.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{fecha(p.fecha)}</td>
              <td>{p.nroOrden ?? '—'}</td>
              <td>{soles(p.total)}</td>
              <td>{legible(p.estado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (historial.comprobantes.length === 0) return vacio;
  return (
    <table>
      <thead>
        <tr>
          <th>Comprobante</th>
          <th>Fecha</th>
          <th>Transacción</th>
          <th>Total</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {historial.comprobantes.map((c) => (
          <tr key={c.id}>
            <td>
              {legible(c.tipo)} {c.numero}
            </td>
            <td>{fecha(c.fechaEmision)}</td>
            <td>{c.transaccion}</td>
            <td>{soles(c.montoTotal)}</td>
            <td>
              <span className={`estado ${c.estado}`}>{legible(c.estado)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
