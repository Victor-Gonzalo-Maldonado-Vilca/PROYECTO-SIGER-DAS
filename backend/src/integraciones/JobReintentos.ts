import type { ProcesarPendientesSunat } from '../aplicacion/comprobantes/ProcesarPendientesSunat';

/**
 * Job de Reintentos (Vista Física: se ejecuta en el Servidor de Aplicaciones 1).
 * Cada `intervaloMs` procesa los comprobantes pendientes vencidos.
 * Es seguro ejecutarlo en varias instancias a la vez: la toma de pendientes usa
 * FOR UPDATE SKIP LOCKED, así que dos workers nunca envían el mismo comprobante.
 */
export function iniciarJobReintentos(procesador: ProcesarPendientesSunat, intervaloMs: number): () => void {
  let ocupado = false;
  const temporizador = setInterval(async () => {
    if (ocupado) return; // evita pasadas superpuestas en la misma instancia
    ocupado = true;
    try {
      const resultados = await procesador.procesarLote();
      for (const r of resultados) {
        console.log(`[SIGER][job] comprobante ${r.comprobanteId}: ${r.estado} — ${r.detalle}`);
      }
    } catch (error) {
      console.error('[SIGER][job] Error en la pasada del job de reintentos:', error);
    } finally {
      ocupado = false;
    }
  }, intervaloMs);
  return () => clearInterval(temporizador);
}
