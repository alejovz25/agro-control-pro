const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { verificarAcceso } = require('../middlewares/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

// Consultar todos los movimientos financieros (gastos, compras y ventas)
router.get('/movimientos', verificarAcceso(['ADMIN', 'TECNICO']), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.*, l.codigo AS lote_codigo, l.nombre AS lote_nombre
       FROM movimientos_contables m
       LEFT JOIN lotes l ON l.id = m.lote_id
       WHERE m.empresa_id = $1
       ORDER BY m.fecha DESC, m.creado_en DESC`,
      [req.usuario.empresa_id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Error consultando movimientos:', err);
    return res.status(500).json({ error: 'Error al consultar movimientos financieros' });
  }
});

// Alias compatible /gastos
router.get('/gastos', verificarAcceso(['ADMIN', 'TECNICO']), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.*, l.codigo AS lote_codigo, l.nombre AS lote_nombre
       FROM movimientos_contables m
       LEFT JOIN lotes l ON l.id = m.lote_id
       WHERE m.empresa_id = $1
       ORDER BY m.fecha DESC, m.creado_en DESC`,
      [req.usuario.empresa_id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Error consultando gastos:', err);
    return res.status(500).json({ error: 'Error al consultar gastos' });
  }
});

// Crear movimiento financiero (GASTO o VENTA) con factura opcional
router.post('/gastos', verificarAcceso(['ADMIN']), upload.single('factura'), async (req, res) => {
  const {
    id,
    lote_id,
    tipo = 'GASTO',
    categoria,
    descripcion,
    monto,
    fecha
  } = req.body;

  if (!descripcion || monto === undefined) {
    return res.status(400).json({ error: 'Descripción y monto son obligatorios' });
  }

  const movId = id || uuidv4();
  const tipoNormalizado = ['GASTO', 'COMPRA', 'VENTA'].includes(String(tipo).toUpperCase())
    ? String(tipo).toUpperCase()
    : 'GASTO';
  const montoNum = Number(monto || 0);
  const urlFactura = req.file ? `/uploads/${req.file.filename}` : null;
  const fechaMov = fecha || new Date().toISOString().slice(0, 10);

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO movimientos_contables (
        id, empresa_id, lote_id, tipo, categoria, descripcion, monto, url_factura, fecha, creado_por
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        tipo = EXCLUDED.tipo,
        categoria = EXCLUDED.categoria,
        descripcion = EXCLUDED.descripcion,
        monto = EXCLUDED.monto,
        fecha = EXCLUDED.fecha
      RETURNING *`,
      [
        movId,
        req.usuario.empresa_id,
        lote_id || null,
        tipoNormalizado,
        categoria || 'GENERAL',
        String(descripcion).trim(),
        montoNum,
        urlFactura,
        fechaMov,
        req.usuario.id
      ]
    );

    if (lote_id && tipoNormalizado === 'VENTA') {
      await client.query(
        `UPDATE lotes
         SET valor_venta_total = COALESCE(valor_venta_total, 0) + $1
         WHERE id = $2 AND empresa_id = $3`,
        [montoNum, lote_id, req.usuario.empresa_id]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error registrando movimiento:', err);
    return res.status(500).json({ error: 'Error al registrar movimiento financiero' });
  } finally {
    if (client) client.release();
  }
});

// Sincronización masiva offline de movimientos financieros
router.post('/sync', verificarAcceso(['ADMIN']), async (req, res) => {
  const { gastos = [], movimientos = [] } = req.body;
  const lista = movimientos.length > 0 ? movimientos : gastos;

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    for (const m of lista) {
      if (!m?.id) continue;
      const tipoNormalizado = ['GASTO', 'COMPRA', 'VENTA'].includes(String(m.tipo || '').toUpperCase())
        ? String(m.tipo).toUpperCase()
        : 'GASTO';

      await client.query(
        `INSERT INTO movimientos_contables (
          id, empresa_id, lote_id, tipo, categoria, descripcion, monto, url_factura, fecha, creado_por
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING`,
        [
          m.id,
          req.usuario.empresa_id,
          m.lote_id || null,
          tipoNormalizado,
          m.categoria || 'GENERAL',
          String(m.descripcion || 'Movimiento offline').trim(),
          Number(m.monto || 0),
          m.url_factura || null,
          m.fecha || new Date().toISOString().slice(0, 10),
          req.usuario.id
        ]
      );
    }

    await client.query('COMMIT');
    return res.json({ ok: true, sincronizados: lista.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error en /finanzas/sync:', err);
    return res.status(500).json({ error: 'Error al sincronizar movimientos financieros' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
