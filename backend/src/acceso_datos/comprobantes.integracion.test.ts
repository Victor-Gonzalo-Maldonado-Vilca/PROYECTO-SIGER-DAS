import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmitirBoleta } from '../aplicacion/comprobantes/EmitirBoleta';
import { ProcesarPendientesSunat } from '../aplicacion/comprobantes/ProcesarPendientesSunat';
import { TipoTransaccion } from '../dominio/comprobantes/TransaccionFacturable';
import { Modulos, Rol, type UsuarioAutenticado } from '../dominio/seguridad/permisos';
import { ServicioTributarioSimulado } from '../integraciones/sunat/ServicioTributarioSimulado';
import { crearFuenteDatos } from './fuenteDatos';
import { UnidadDeTrabajoTypeORM } from './UnidadDeTrabajoTypeORM';

/**
 * ILA-0018 + Job de Reintentos contra PostgreSQL REAL y SUNAT simulada.
 * Ejecutar con: npm run test:integracion
 * Escenarios de la Tabla 7 del Hito 3: «respuesta SUNAT perdida sin emisión duplicada».
 */
const DNI = '99999902';
const RUC = '20999999902';
let ds: DataSource;
let usuario: UsuarioAutenticado;
let sunat: ServicioTributarioSimulado;
let procesador: ProcesarPendientesSunat;
let emitir: EmitirBoleta;
let contador = 0;

async function crearVentaMoto(documento = DNI, precio = 118): Promise<number> {
  contador += 1;
  const [{ id: motoId }] = await ds.query(
    `INSERT INTO tab_moto (marca, modelo, anio, color, numero_motor, numero_chasis)
     VALUES ('Prueba', 'IT', 2026, 'Negro', $1, $2) RETURNING id`,
    [`IT-CB-MOT-${contador}`, `IT-CB-CHS-${contador}`],
  );
  const [{ id }] = await ds.query(
    `INSERT INTO tab_venta_moto (precio, estado, moto_id, cliente_id, usuario_id)
     SELECT $1, 'CON_CLIENTE', $2, c.id, $3 FROM tab_cliente c WHERE c.numero_documento = $4 RETURNING id`,
    [precio, motoId, usuario.id, documento],
  );
  return Number(id);
}

async function crearOrdenFinalizada(): Promise<number> {
  contador += 1;
  const [{ id: clienteId }] = await ds.query(`SELECT id FROM tab_cliente WHERE numero_documento = $1`, [DNI]);
  const [{ id: motoId }] = await ds.query(
    `INSERT INTO tab_moto (placa, marca, modelo, anio, color, numero_motor, numero_chasis, cliente_id)
     VALUES ($1, 'Prueba', 'IT', 2024, 'Rojo', $2, $3, $4) RETURNING id`,
    [`ITCB-${contador}`, `IT-CB-MOT-${contador}`, `IT-CB-CHS-${contador}`, clienteId],
  );
  const [{ id: ordenId }] = await ds.query(
    `INSERT INTO tab_os (tipo_servicio, descripcion, estado, cliente_id, moto_id)
     VALUES ('REPARACION', 'Orden IT', 'FINALIZADO', $1, $2) RETURNING id`,
    [clienteId, motoId],
  );
  const [{ id: proformaId }] = await ds.query(
    `INSERT INTO tab_p (estado, total, cliente_id, orden_id) VALUES ('APROBADA', 59, $1, $2) RETURNING id`,
    [clienteId, ordenId],
  );
  await ds.query(
    `INSERT INTO tab_dp (proforma_id, tipo_item, descripcion, cantidad, costo_unit, subtotal)
     VALUES ($1, 'SERVICIO', 'Revisión', 1, 59, 59)`,
    [proformaId],
  );
  await ds.query(
    `INSERT INTO tab_cs (orden_id, proforma_id, kilometraje, trabajos_realizados, insumos_empleados, precio_total, firma_cliente, usuario_id)
     VALUES ($1, $2, 100, 'Revisión', 'Sin insumos', 59, '\\x89504e470d0a1a0a00'::bytea, $3)`,
    [ordenId, proformaId, usuario.id],
  );
  return Number(ordenId);
}

const MOTOS_IT = `SELECT id FROM tab_moto WHERE numero_motor LIKE 'IT-CB-%'`;
const ORDENES_IT = `SELECT id FROM tab_os WHERE moto_id IN (${MOTOS_IT})`;
const VENTAS_IT = `SELECT id FROM tab_venta_moto WHERE moto_id IN (${MOTOS_IT})`;
const COMPROBANTES_IT = `SELECT id FROM tab_comprobante_oficial
  WHERE (tipo_transaccion = 'VENTA_MOTO' AND transaccion_id IN (${VENTAS_IT}))
     OR (tipo_transaccion = 'ORDEN_SERVICIO' AND transaccion_id IN (${ORDENES_IT}))`;

async function limpiar() {
  await ds.query(`DELETE FROM tab_auditoria WHERE entidad = 'Tab_comprobante_oficial' AND entidad_id IN (${COMPROBANTES_IT})`);
  await ds.query(`DELETE FROM tab_comprobante_pendiente WHERE comprobante_id IN (${COMPROBANTES_IT})`);
  await ds.query(`DELETE FROM tab_comprobante_oficial WHERE id IN (${COMPROBANTES_IT})`);
  await ds.query(`DELETE FROM tab_cs WHERE orden_id IN (${ORDENES_IT})`);
  await ds.query(`DELETE FROM tab_p WHERE orden_id IN (${ORDENES_IT})`);
  await ds.query(`DELETE FROM tab_trazabilidad WHERE orden_id IN (${ORDENES_IT})`);
  await ds.query(`DELETE FROM tab_os WHERE id IN (${ORDENES_IT})`);
  await ds.query(`DELETE FROM tab_venta_moto WHERE id IN (${VENTAS_IT})`);
  await ds.query(`DELETE FROM tab_moto WHERE numero_motor LIKE 'IT-CB-%'`);
  // Devuelve la serie al último número realmente usado (sin huecos en la BD de desarrollo).
  await ds.query(
    `UPDATE tab_serie_comprobante s SET ultimo_numero = COALESCE(
       (SELECT MAX(numero) FROM tab_comprobante_oficial co WHERE co.tipo_comprobante = s.tipo_comprobante AND co.serie = s.serie), 0)`,
  );
}

const ultimoNumero = async () =>
  Number((await ds.query(`SELECT ultimo_numero FROM tab_serie_comprobante WHERE serie = 'B001'`))[0].ultimo_numero);
const estadoVenta = async (id: number) =>
  String((await ds.query(`SELECT estado FROM tab_venta_moto WHERE id = $1`, [id]))[0].estado);
const comprobanteDe = async (tipo: string, id: number) =>
  (
    await ds.query(
      `SELECT co.id, co.estado, co.numero, co.subtotal, co.igv, co.monto_total, p.estado AS envio, p.intentos
         FROM tab_comprobante_oficial co JOIN tab_comprobante_pendiente p ON p.comprobante_id = co.id
        WHERE co.tipo_transaccion = $1 AND co.transaccion_id = $2`,
      [tipo, id],
    )
  )[0];

beforeAll(async () => {
  ds = crearFuenteDatos();
  await ds.initialize();
  const [g] = await ds.query(`SELECT id FROM tab_usuario WHERE usuario = 'gerente'`);
  usuario = { id: Number(g.id), usuario: 'gerente', nombreCompleto: 'Gerente', rol: Rol.GERENTE, modulos: [Modulos.COMPROBANTES] };
  await ds.query(
    `INSERT INTO tab_cliente (tipo_documento, numero_documento, nombre_razon_social) VALUES
       ('DNI', $1, 'Cliente IT natural'), ('RUC', $2, 'Cliente IT jurídico S.A.C.')
     ON CONFLICT (numero_documento) DO NOTHING`,
    [DNI, RUC],
  );
});

beforeEach(async () => {
  await limpiar();
  sunat = new ServicioTributarioSimulado('NORMAL', 0);
  const uow = new UnidadDeTrabajoTypeORM(ds);
  procesador = new ProcesarPendientesSunat(uow, sunat);
  emitir = new EmitirBoleta(uow, procesador);
});

afterAll(async () => {
  await limpiar();
  await ds.query(`DELETE FROM tab_cliente WHERE numero_documento IN ($1, $2)`, [DNI, RUC]);
  await ds.destroy();
});

describe('ILA-0018 Emitir boleta (PRO-03 / PRO-04)', () => {
  it('SUNAT acepta: MSG-62, comprobante EMITIDO y venta en COMPROBANTE_EMITIDO', async () => {
    const ventaId = await crearVentaMoto();
    const r = await emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario);

    expect(r).toMatchObject({ codigo: 'MSG-62', emitido: true, estadoEnvio: 'CONFIRMADO' });
    expect(r.numeroCompleto).toMatch(/^B001-\d{8}$/);
    expect(await comprobanteDe('VENTA_MOTO', ventaId)).toMatchObject({
      estado: 'EMITIDO',
      envio: 'CONFIRMADO',
      subtotal: '100.00',
      igv: '18.00',
      monto_total: '118.00',
    });
    expect(await estadoVenta(ventaId)).toBe('COMPROBANTE_EMITIDO');
  });

  it('SUNAT caída: MSG-61, la venta mantiene su estado y el reintento posterior la emite', async () => {
    const ventaId = await crearVentaMoto();
    sunat.modo = 'CAIDO';
    const r = await emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario);

    expect(r).toMatchObject({ codigo: 'MSG-61', emitido: false, estadoEnvio: 'PENDIENTE' });
    expect(await estadoVenta(ventaId)).toBe('CON_CLIENTE');
    expect(await comprobanteDe('VENTA_MOTO', ventaId)).toMatchObject({ estado: 'GENERADO', envio: 'PENDIENTE' });

    sunat.modo = 'NORMAL';
    const reintento = await procesador.procesarSiguiente(r.comprobanteId);
    expect(reintento?.estado).toBe('CONFIRMADO');
    expect(await estadoVenta(ventaId)).toBe('COMPROBANTE_EMITIDO');
  });

  it('respuesta perdida: queda POR_CONCILIAR y al reintentar CONSULTA en vez de reenviar (sin duplicar)', async () => {
    const ventaId = await crearVentaMoto();
    const enviar = vi.spyOn(sunat, 'enviarComprobante');
    sunat.modo = 'RESPUESTA_PERDIDA';
    const r = await emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario);
    expect(r.estadoEnvio).toBe('POR_CONCILIAR');

    sunat.modo = 'NORMAL';
    const reintento = await procesador.procesarSiguiente(r.comprobanteId);
    expect(reintento?.estado).toBe('CONFIRMADO');
    expect(enviar).toHaveBeenCalledTimes(1); // solo el envío original; el reintento solo consultó
    expect(await comprobanteDe('VENTA_MOTO', ventaId)).toMatchObject({ estado: 'EMITIDO', intentos: 2 });
  });

  it('rechazo de SUNAT: comprobante RECHAZADO y la transacción vuelve a quedar disponible', async () => {
    const ventaId = await crearVentaMoto();
    sunat.modo = 'RECHAZAR';
    const r = await emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario);
    expect(r).toMatchObject({ codigo: 'RECHAZO-SUNAT', estadoEnvio: 'RECHAZADO' });
    expect(await estadoVenta(ventaId)).toBe('CON_CLIENTE');

    sunat.modo = 'NORMAL';
    const segundo = await emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario);
    expect(segundo.codigo).toBe('MSG-62');
  });

  it('cliente con RUC: no se emite boleta y NO se consume número de la serie', async () => {
    const ventaId = await crearVentaMoto(RUC);
    const antes = await ultimoNumero();
    await expect(emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario)).rejects.toMatchObject({
      codigo: 'VAL-BOLETA',
    });
    expect(await ultimoNumero()).toBe(antes);
  });

  it('dos emisiones simultáneas de la misma venta: un solo comprobante', async () => {
    const ventaId = await crearVentaMoto();
    const antes = await ultimoNumero();
    const res = await Promise.allSettled([
      emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario),
      emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario),
    ]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(res.find((x): x is PromiseRejectedResult => x.status === 'rejected')?.reason).toMatchObject({
      codigo: 'COMPROBANTE-EXISTE',
    });
    expect(await ultimoNumero()).toBe(antes + 1); // el rechazado no dejó hueco
  });

  it('dos ventas distintas a la vez reciben números consecutivos sin huecos', async () => {
    const [a, b] = [await crearVentaMoto(), await crearVentaMoto()];
    const antes = await ultimoNumero();
    const res = await Promise.all([
      emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: a }, usuario),
      emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: b }, usuario),
    ]);
    const numeros = res.map((r) => Number(r.numeroCompleto.slice(5))).sort((x, y) => x - y);
    expect(numeros).toEqual([antes + 1, antes + 2]);
  });

  it('dos workers a la vez no toman el mismo pendiente (SKIP LOCKED)', async () => {
    const ventaId = await crearVentaMoto();
    sunat.modo = 'CAIDO';
    const r = await emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario);
    sunat.modo = 'NORMAL';

    const enviar = vi.spyOn(sunat, 'enviarComprobante');
    const [w1, w2] = await Promise.all([procesador.procesarSiguiente(r.comprobanteId), procesador.procesarSiguiente(r.comprobanteId)]);
    expect([w1, w2].filter(Boolean)).toHaveLength(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('un trabajo abandonado EN_PROCESO se recupera como POR_CONCILIAR y se concilia', async () => {
    const ventaId = await crearVentaMoto();
    sunat.modo = 'CAIDO';
    const r = await emitir.ejecutar({ tipoTransaccion: 'VENTA_MOTO', transaccionId: ventaId }, usuario);
    // Simula un worker que murió hace 10 minutos a mitad del envío.
    await ds.query(
      `UPDATE tab_comprobante_pendiente SET estado = 'EN_PROCESO', tomado_en = NOW() - INTERVAL '10 minutes', proximo_intento = NOW()
        WHERE comprobante_id = $1`,
      [r.comprobanteId],
    );
    sunat.modo = 'NORMAL';
    const lote = await procesador.procesarLote();
    expect(lote.find((x) => x.comprobanteId === r.comprobanteId)?.estado).toBe('CONFIRMADO');
  });

  it('orden de servicio: la boleta la pasa a ENTREGADO y queda en el historial', async () => {
    const ordenId = await crearOrdenFinalizada();
    const r = await emitir.ejecutar({ tipoTransaccion: TipoTransaccion.ORDEN_SERVICIO, transaccionId: ordenId }, usuario);
    expect(r.codigo).toBe('MSG-62');
    const [os] = await ds.query(`SELECT estado FROM tab_os WHERE id = $1`, [ordenId]);
    expect(os.estado).toBe('ENTREGADO');
    const hist = await ds.query(`SELECT estado_anterior, estado_nuevo FROM tab_trazabilidad WHERE orden_id = $1`, [ordenId]);
    expect(hist).toEqual([{ estado_anterior: 'FINALIZADO', estado_nuevo: 'ENTREGADO' }]);
  });
});
