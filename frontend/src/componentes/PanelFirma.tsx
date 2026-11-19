import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * PAD-01 — panel de digitalización de la firma del cliente.
 * Funciona con mouse, lápiz o dedo (Pointer Events), así sirve en la laptop
 * y en la tablet del taller (Vista Física).
 */
export interface PanelFirmaRef {
  /** PNG en base64 (data URL) o null si el trazo está vacío. */
  obtenerFirma: () => string | null;
  limpiar: () => void;
}

export const PanelFirma = forwardRef<PanelFirmaRef, { alCambiar?: (tieneTrazo: boolean) => void }>(
  function PanelFirma({ alCambiar }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const dibujando = useRef(false);
    const [tieneTrazo, setTieneTrazo] = useState(false);

    const contexto = () => canvas.current?.getContext('2d') ?? null;

    // Ajusta la resolución interna al tamaño real (nitidez en pantallas de alta densidad).
    useEffect(() => {
      const c = canvas.current;
      if (!c) return;
      const escala = window.devicePixelRatio || 1;
      c.width = c.clientWidth * escala;
      c.height = c.clientHeight * escala;
      const ctx = contexto();
      if (ctx) {
        ctx.scale(escala, escala);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111';
      }
    }, []);

    const marcarTrazo = (valor: boolean) => {
      setTieneTrazo(valor);
      alCambiar?.(valor);
    };

    const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const iniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dibujando.current = true;
      const { x, y } = punto(e);
      const ctx = contexto();
      ctx?.beginPath();
      ctx?.moveTo(x, y);
    };

    const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dibujando.current) return;
      const { x, y } = punto(e);
      const ctx = contexto();
      ctx?.lineTo(x, y);
      ctx?.stroke();
      if (!tieneTrazo) marcarTrazo(true);
    };

    const terminar = () => {
      dibujando.current = false;
    };

    useImperativeHandle(ref, () => ({
      obtenerFirma: () => (tieneTrazo && canvas.current ? canvas.current.toDataURL('image/png') : null),
      limpiar: () => {
        const c = canvas.current;
        if (c) contexto()?.clearRect(0, 0, c.width, c.height);
        marcarTrazo(false);
      },
    }));

    return (
      <div className="panel-firma">
        <canvas
          ref={canvas}
          aria-label="Panel de firma del cliente (PAD-01)"
          onPointerDown={iniciar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
        />
        {!tieneTrazo && <span className="indicacion">Firme aquí</span>}
      </div>
    );
  },
);
