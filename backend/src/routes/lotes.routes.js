const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { verificarAcceso } = require('../middlewares/auth');

const router = express.Router();

// Listar lotes de la empresa
router.get('/', verificarAcceso(['ADMIN', 'TECNICO', 'OPERARIO']), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM lotes WHERE empresa_id = $1 ORDER BY creado_en DESC`,
      [req.usuario.empresa_id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Error listando lotes:', err);
    return res.status(500).json({ error: 'Error al consultar lotes' });
  }
});

// Listar todos los seguimientos / observaciones de la empresa
router.get('/seguimientos', verificarAcceso(['ADMIN', 'TECNICO', 'OPERARIO']), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, l.codigo AS lote_codigo, l.nombre AS lote_nombre
       FROM seguimientos s
       LEFT JOIN lotes l ON l.id = s.lote_id
       WHERE s.empresa_id = $1
       ORDER BY s.fecha_registro DESC, s.creado_en DESC`,
      [req.usuario.empresa_id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Error listando seguimientos:', err);
    return res.status(500).json({ error: 'Error al consultar seguimientos' });
  }
});

// Crear lote (ADMIN) + registrar movimiento de compra si aplica
router.post('/', verificarAcceso(['ADMIN']), async (req, res) => {
  const {
    id,
    codigo,
    nombre,
    especie,
    cantidad_inicial,
    cantidad_actual,
    peso_inicial_kg = 0,
    peso_final_kg = 0,
    costo_compra_total = 0,
    valor_venta_total = 0,
    fecha_inicio,
    estado = 'ACTIVO'
  } = req.body;

  if (!codigo || !nombre || !especie || !fecha_inicio) {
    return res.status(400).json({ error: 'Código, nombre, especie y fecha de inicio son obligatorios' });
  }

  const loteId = id || uuidv4();
  const cantIni = Number(cantidad_inicial || 0);
  const cantAct = cantidad_actual !== undefined ? Number(cantidad_actual) : cantIni;
  const pesoIni = Number(peso_inicial_kg || 0);
  const pesoFin = Number(peso_final_kg || 0);
  const costoCompra = Number(costo_compra_total || 0);
  const valorVenta = Number(valor_venta_total || 0);

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO lotes (
        id, empresa_id, codigo, nombre, especie, cantidad_inicial, cantidad_actual,
        peso_inicial_kg, peso_final_kg, costo_compra_total, valor_venta_total,
        fecha_inicio, estado
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        codigo = EXCLUDED.codigo,
        nombre = EXCLUDED.nombre,
        especie = EXCLUDED.especie,
        cantidad_actual = EXCLUDED.cantidad_actual,
        peso_inicial_kg = EXCLUDED.peso_inicial_kg,
        peso_final_kg = EXCLUDED.peso_final_kg,
        costo_compra_total = EXCLUDED.costo_compra_total,
        valor_venta_total = EXCLUDED.valor_venta_total,
        estado = EXCLUDED.estado
      RETURNING *`,
      [
        loteId,
        req.usuario.empresa_id,
        String(codigo).trim(),
        String(nombre).trim(),
        String(especie).trim(),
        cantIni,
        cantAct,
        pesoIni,
        pesoFin,
        costoCompra,
        valorVenta,
        fecha_inicio,
        estado
      ]
    );

    if (costoCompra > 0) {
      await client.query(
        `INSERT INTO movimientos_contables (
          id, empresa_id, lote_id, tipo, categoria, descripcion, monto, fecha, creado_por
        )
        VALUES ($1,$2,$3,'COMPRA','COMPRA_LOTE',$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING`,
        [
          `compra-${loteId}`,
          req.usuario.empresa_id,
          loteId,
          `Compra inicial lote ${String(codigo).trim()} - ${String(nombre).trim()}`,
          costoCompra,
          fecha_inicio,
          req.usuario.id
        ]
      );
    }

    if (valorVenta > 0) {
      await client.query(
        `INSERT INTO movimientos_contables (
          id, empresa_id, lote_id, tipo, categoria, descripcion, monto, fecha, creado_por
        )
        VALUES ($1,$2,$3,'VENTA','VENTA_LOTE',$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING`,
        [
          `venta-${loteId}`,
          req.usuario.empresa_id,
          loteId,
          `Venta lote ${String(codigo).trim()} - ${String(nombre).trim()}`,
          valorVenta,
          fecha_inicio,
          req.usuario.id
        ]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error creando lote:', err);
    return res.status(500).json({ error: err.detail || err.message || 'Error al crear lote' });
  } finally {
    if (client) client.release();
  }
});

// Actualizar lote (peso final, valor de venta, estado, etc.)
router.patch('/:id', verificarAcceso(['ADMIN', 'TECNICO']), async (req, res) => {
  const { id } = req.params;
  const { peso_final_kg, valor_venta_total, costo_compra_total, estado } = req.body;

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const actualRes = await client.query(
      `SELECT * FROM lotes WHERE id = $1 AND empresa_id = $2`,
      [id, req.usuario.empresa_id]
    );
    if (actualRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lote no encontrado' });
    }

    const actual = actualRes.rows[0];
    const nuevoPesoFinal =
      peso_final_kg !== undefined ? Number(peso_final_kg) : Number(actual.peso_final_kg || 0);
    const nuevaVenta =
      valor_venta_total !== undefined
        ? Number(valor_venta_total)
        : Number(actual.valor_venta_total || 0);
    const nuevaCompra =
      costo_compra_total !== undefined
        ? Number(costo_compra_total)
        : Number(actual.costo_compra_total || 0);
    const nuevoEstado = estado || actual.estado;

    const { rows } = await client.query(
      `UPDATE lotes
       SET peso_final_kg = $1, valor_venta_total = $2, costo_compra_total = $3, estado = $4
       WHERE id = $5 AND empresa_id = $6
       RETURNING *`,
      [nuevoPesoFinal, nuevaVenta, nuevaCompra, nuevoEstado, id, req.usuario.empresa_id]
    );

    if (nuevaVenta > 0) {
      await client.query(
        `INSERT INTO movimientos_contables (
          id, empresa_id, lote_id, tipo, categoria, descripcion, monto, fecha, creado_por
        )
        VALUES ($1,$2,$3,'VENTA','VENTA_LOTE',$4,$5,CURRENT_DATE,$6)
        ON CONFLICT (id) DO UPDATE SET monto = EXCLUDED.monto`,
        [
          `venta-${id}`,
          req.usuario.empresa_id,
          id,
          `Venta lote ${actual.codigo} - ${actual.nombre}`,
          nuevaVenta,
          req.usuario.id
        ]
      );
    }

    await client.query('COMMIT');
    return res.json(rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error actualizando lote:', err);
    return res.status(500).json({ error: 'Error al actualizar lote' });
  } finally {
    if (client) client.release();
  }
});

// Registrar seguimiento diario y ajustar cantidad_actual por mortalidad / ingresos_animales
router.post('/seguimientos', verificarAcceso(['ADMIN', 'TECNICO', 'OPERARIO']), async (req, res) => {
  const {
    id,
    lote_id,
    tipo_registro,
    valor_principal = 0,
    alimento_kg = 0,
    mortalidad = 0,
    ingresos_animales = 0,
    observaciones = '',
    fecha_registro
  } = req.body;

  if (!lote_id || !tipo_registro) {
    return res.status(400).json({ error: 'lote_id y tipo_registro son obligatorios' });
  }

  const segId = id || uuidv4();
  const mort = Math.max(0, Number(mortalidad || 0));
  const ing = Math.max(0, Number(ingresos_animales || 0));
  const val = Number(valor_principal || 0);
  const alim = Number(alimento_kg || 0);
  const fecha = fecha_registro || new Date().toISOString().slice(0, 10);

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const loteRes = await client.query(
      `SELECT * FROM lotes WHERE id = $1 AND empresa_id = $2`,
      [lote_id, req.usuario.empresa_id]
    );
    if (loteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'El lote seleccionado no existe' });
    }

    const lote = loteRes.rows[0];
    const nuevaCantidad = Math.max(0, Number(lote.cantidad_actual || 0) + ing - mort);
    const nuevoPesoFinal =
      tipo_registro === 'PESO_KG' && val > 0 ? val : Number(lote.peso_final_kg || 0);

    await client.query(
      `UPDATE lotes SET cantidad_actual = $1, peso_final_kg = $2 WHERE id = $3`,
      [nuevaCantidad, nuevoPesoFinal, lote_id]
    );

    const { rows } = await client.query(
      `INSERT INTO seguimientos (
        id, empresa_id, lote_id, usuario_id, autor_nombre, tipo_registro,
        valor_principal, alimento_kg, mortalidad, ingresos_animales, observaciones, fecha_registro
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        tipo_registro = EXCLUDED.tipo_registro,
        valor_principal = EXCLUDED.valor_principal,
        alimento_kg = EXCLUDED.alimento_kg,
        mortalidad = EXCLUDED.mortalidad,
        ingresos_animales = EXCLUDED.ingresos_animales,
        observaciones = EXCLUDED.observaciones,
        fecha_registro = EXCLUDED.fecha_registro
      RETURNING *`,
      [
        segId,
        req.usuario.empresa_id,
        lote_id,
        req.usuario.id,
        req.usuario.nombre,
        tipo_registro,
        val,
        alim,
        mort,
        ing,
        String(observaciones || '').trim(),
        fecha
      ]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      seguimiento: rows[0],
      cantidad_actual: nuevaCantidad,
      peso_final_kg: nuevoPesoFinal
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error guardando seguimiento:', err);
    return res.status(500).json({ error: 'Error al guardar seguimiento' });
  } finally {
    if (client) client.release();
  }
});

// Sincronización masiva offline de seguimientos (y lotes si vienen pendientes)
router.post('/sync', verificarAcceso(['ADMIN', 'TECNICO', 'OPERARIO']), async (req, res) => {
  const { seguimientos = [], lotes = [] } = req.body;
  let client;

  try {
    client = await db.connect();
    await client.query('BEGIN');

    for (const l of lotes) {
      if (!l?.id || req.usuario.rol !== 'ADMIN') continue;
      await client.query(
        `INSERT INTO lotes (
          id, empresa_id, codigo, nombre, especie, cantidad_inicial, cantidad_actual,
          peso_inicial_kg, peso_final_kg, costo_compra_total, valor_venta_total,
          fecha_inicio, estado
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO NOTHING`,
        [
          l.id,
          req.usuario.empresa_id,
          l.codigo,
          l.nombre,
          l.especie,
          Number(l.cantidad_inicial || 0),
          Number(l.cantidad_actual ?? l.cantidad_inicial ?? 0),
          Number(l.peso_inicial_kg || 0),
          Number(l.peso_final_kg || 0),
          Number(l.costo_compra_total || 0),
          Number(l.valor_venta_total || 0),
          l.fecha_inicio || new Date().toISOString().slice(0, 10),
          l.estado || 'ACTIVO'
        ]
      );
    }

    for (const s of seguimientos) {
      if (!s?.id || !s?.lote_id) continue;
      const loteRes = await client.query(
        `SELECT * FROM lotes WHERE id = $1 AND empresa_id = $2`,
        [s.lote_id, req.usuario.empresa_id]
      );
      if (loteRes.rows.length === 0) continue;

      const existeSeg = await client.query(`SELECT id FROM seguimientos WHERE id = $1`, [s.id]);
      if (existeSeg.rows.length > 0) continue;

      const mort = Math.max(0, Number(s.mortalidad || 0));
      const ing = Math.max(0, Number(s.ingresos_animales || 0));
      const val = Number(s.valor_principal || 0);
      const lote = loteRes.rows[0];
      const nuevaCant = Math.max(0, Number(lote.cantidad_actual || 0) + ing - mort);
      const nuevoPesoFinal =
        s.tipo_registro === 'PESO_KG' && val > 0 ? val : Number(lote.peso_final_kg || 0);

      await client.query(
        `UPDATE lotes SET cantidad_actual = $1, peso_final_kg = $2 WHERE id = $3`,
        [nuevaCant, nuevoPesoFinal, s.lote_id]
      );

      await client.query(
        `INSERT INTO seguimientos (
          id, empresa_id, lote_id, usuario_id, autor_nombre, tipo_registro,
          valor_principal, alimento_kg, mortalidad, ingresos_animales, observaciones, fecha_registro
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          s.id,
          req.usuario.empresa_id,
          s.lote_id,
          req.usuario.id,
          s.autor_nombre || req.usuario.nombre,
          s.tipo_registro || 'LECHE_LITROS',
          val,
          Number(s.alimento_kg || 0),
          mort,
          ing,
          String(s.observaciones || '').trim(),
          s.fecha_registro || new Date().toISOString().slice(0, 10)
        ]
      );
    }

    await client.query('COMMIT');
    return res.json({ ok: true, sincronizados: seguimientos.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error en /lotes/sync:', err);
    return res.status(500).json({ error: 'Error al sincronizar seguimientos' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
