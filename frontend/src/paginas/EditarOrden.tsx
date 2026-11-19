import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, leerErrorApi, type ErrorApi } from '../api/cliente';

/**
 * INT-003 — Actualizar avance y estado de la orden (CU-TAL-03).
 * INP-01, INP-02, INP-04, INP-05, SEL-01, INP-06 editables · INP-03 placa solo lectura
 * · SEL-02 estado · BTN-01 Confirmar · BTN-02 Cancelar · LBL-01 / LBL-02 / LBL-03
 * · línea de tiempo de Tab_trazabilidad.
 */

interface Detalle {
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
  color: string | null;
  version: number;
  editable: boolean;
  estadosPermitidos: string[];
  historial: Array<{ estadoAnterior: string | null; estadoNuevo: string; usuario: string; fechaHora: string }>;
}

export const ESTADO_ORDEN: Record<string, string> = {
  RECEPCIONADO: 'Recepcionado',
  EN_PROCESO: 'En proceso',
  POR_ENTREGAR: 'Por entregar',
  FINALIZADO: 'Finalizado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

export default function EditarOrden({ ordenId, alCerrar }: { ordenId: number; alCerrar: (mensaje?: string) => void }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorApi | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const d = (await api.get<Detalle>(`/ordenes/${ordenId}`)).data;
      setDetalle(d);
      setForm({
        nombresCliente: d.cliente,
        telefono: d.telefono ?? '',
        color: d.color ?? '',
        modelo: d.modelo ?? '',
        tipoServicio: d.tipoServicio,
        descripcion: d.descripcion,
        estado: d.estado,
      });
    } catch (err) {
      setError(leerErrorApi(err));
    }
  }, [ordenId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!detalle) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await api.put<{ mensaje: string; nroOrden: string; estado: string }>(`/ordenes/${ordenId}`, {
        ...form,
        version: detalle.version, // bloqueo optimista
      });
      alCerrar(`${r.data.mensaje}: ${r.data.nroOrden} · Estado: ${ESTADO_ORDEN[r.data.estado] ?? r.data.estado}`);
    } catch (err) {
      setError(leerErrorApi(err));
    } finally {
      setGuardando(false);
    }
  };

  if (!detalle) {
    return (
      <div className="tarjeta">
        {error ? <p className="mensaje error">{error.mensaje}</p> : <p className="sutil">Cargando la orden…</p>}
        <button className="secundario" onClick={() => alCerrar()}>
          Volver
        </button>
      </div>
    );
  }

  const bloqueado = !detalle.editable;
  const campo = (nombre: string, etiqueta: string, codigo: string) => (
    <label className={error?.campo === nombre ? 'invalido' : ''}>
      {etiqueta} <span className="sutil">({codigo})</span>
      <input value={form[nombre] ?? ''} disabled={bloqueado} onChange={(e) => setForm({ ...form, [nombre]: e.target.value })} />
    </label>
  );

  return (
    <form className="tarjeta" onSubmit={guardar} noValidate>
      <div className="encabezado">
        <h3>Editar orden {detalle.nroOrden}</h3>
        <span className={`estado ${detalle.estado}`}>{ESTADO_ORDEN[detalle.estado]}</span>
      </div>

      {bloqueado && (
        <p className="mensaje error">
          Órdenes en estado {ESTADO_ORDEN[detalle.estado]} no pueden editarse.
        </p>
      )}

      <h4 className="subtitulo">Cliente</h4>
      <div className="rejilla">
        {campo('nombresCliente', 'Nombres', 'INP-01')}
        {campo('telefono', 'Teléfono', 'INP-02')}
      </div>

      <h4 className="subtitulo">Motocicleta</h4>
      <div className="rejilla">
        <label>
          Placa <span className="sutil">(INP-03, solo lectura)</span>
          <input value={detalle.placa ?? '—'} disabled />
        </label>
        {campo('color', 'Color (opcional)', 'INP-04')}
        {campo('modelo', 'Modelo (opcional)', 'INP-05')}
      </div>

      <h4 className="subtitulo">Servicio y avance</h4>
      <div className="rejilla">
        <label className={error?.campo === 'tipoServicio' ? 'invalido' : ''}>
          Tipo de servicio <span className="sutil">(SEL-01)</span>
          <select value={form.tipoServicio} disabled={bloqueado} onChange={(e) => setForm({ ...form, tipoServicio: e.target.value })}>
            <option value="MANTENIMIENTO">Mantenimiento</option>
            <option value="REPARACION">Reparación</option>
          </select>
        </label>
        <label className={error?.campo === 'estado' ? 'invalido' : ''}>
          Estado <span className="sutil">(SEL-02)</span>
          <select value={form.estado} disabled={bloqueado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
            {detalle.estadosPermitidos.map((e) => (
              <option key={e} value={e}>
                {ESTADO_ORDEN[e] ?? e}
                {e === detalle.estado ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="sutil">
        Finalizado se registra con la conformidad del cliente y Entregado al emitir el comprobante.
      </p>
      <label className={`ancho ${error?.campo === 'descripcion' ? 'invalido' : ''}`}>
        Descripción <span className="sutil">(INP-06)</span>
        <textarea
          rows={3}
          maxLength={500}
          value={form.descripcion}
          disabled={bloqueado}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />
      </label>

      {error && (
        <p className="mensaje error">
          {error.codigo && <strong>{error.codigo}: </strong>}
          {error.mensaje}
          {error.codigo === 'ORDEN-MODIFICADA' && (
            <button type="button" className="secundario enlinea" onClick={() => void cargar()}>
              Recargar
            </button>
          )}
        </p>
      )}

      <div className="acciones">
        <button type="button" className="secundario" onClick={() => alCerrar()} disabled={guardando}>
          {bloqueado ? 'Volver' : 'Cancelar'}
        </button>
        {!bloqueado && (
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Confirmar'}
          </button>
        )}
      </div>

      <h4 className="subtitulo">Historial de estados</h4>
      <ol className="linea-tiempo">
        {detalle.historial.map((h, i) => (
          <li key={i}>
            <strong>{ESTADO_ORDEN[h.estadoNuevo] ?? h.estadoNuevo}</strong>
            {h.estadoAnterior && <span className="sutil"> (desde {ESTADO_ORDEN[h.estadoAnterior] ?? h.estadoAnterior})</span>}
            <span className="sutil">
              {' '}
              · {new Date(h.fechaHora).toLocaleString('es-PE')} · {h.usuario}
            </span>
          </li>
        ))}
        {detalle.historial.length === 0 && <li className="sutil">Sin registros de trazabilidad.</li>}
      </ol>
    </form>
  );
}
