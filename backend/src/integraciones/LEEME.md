# Capa de Integraciones Externas

Aquí irán los adaptadores hacia sistemas externos. El dominio solo conoce sus interfaces (puertos).

Pendiente (Hito 3):

- **ServicioTributario (SUNAT OSE/PSE)**: es el adaptador del contrato definido en MOD-08.
- **Job de reintentos + `tab_comprobante_pendiente`** (PRO-03 y PRO-04):
  - el job usa el patrón outbox: guarda el pendiente en la misma transacción que la venta;
  - toma los pendientes de forma exclusiva con `SELECT ... FOR UPDATE SKIP LOCKED`;
  - maneja los estados pendiente → en proceso → confirmado / rechazado / por conciliar.
- **Pasarela de pagos**: es una capacidad prevista, todavía no implementada.

Mientras no se elija el proveedor SUNAT, se usará un adaptador simulado (mock).
