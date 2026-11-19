# Capa de Integraciones Externas

Aquí van los adaptadores hacia los sistemas externos. El dominio solo conoce sus interfaces (puertos).

## Lo implementado

- **`sunat/ServicioTributarioSimulado.ts`**: un adaptador **simulado** de `ServicioTributario`. Tiene cuatro modos:
  - `NORMAL`: SUNAT acepta.
  - `CAIDO`: SUNAT no responde.
  - `RESPUESTA_PERDIDA`: SUNAT recibe el comprobante, pero la respuesta se pierde.
  - `RECHAZAR`: SUNAT rechaza el comprobante.

  El modo inicial se configura con `SUNAT_SIMULADO_MODO` en `.env`. Durante el desarrollo, el gerente puede cambiarlo con `PUT /api/dev/sunat-simulado`, o desde la pantalla de comprobantes.
- **`JobReintentos.ts`**: el job de reintentos (PRO-03). Cada `JOB_INTERVALO_MS` ejecuta `ProcesarPendientesSunat`:
  - toma los pendientes con `FOR UPDATE SKIP LOCKED`;
  - envía a SUNAT fuera de cualquier transacción;
  - si el resultado es incierto, consulta a SUNAT antes de reenviar;
  - aplica reintentos con espera creciente;
  - tras 5 intentos fallidos, deja el pendiente en `REVISION_REQUERIDA`.

## Pendiente

- **El adaptador real del proveedor SUNAT (OSE/PSE)** debe implementar la misma interfaz `ServicioTributario`. Antes de escribirlo hay que verificar con el proveedor cuatro cosas: cómo identifica cada comprobante, cómo se consulta su estado, qué códigos de respuesta usa y qué reglas de retransmisión aplica.
- **La pasarela de pagos** es una capacidad prevista, todavía no implementada.
