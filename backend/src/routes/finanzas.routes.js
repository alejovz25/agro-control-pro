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

async function listarMovimientos(empresaId) {
  const { rows } = await db.query(
    `SELECT m.*, l.codigo AS lote_codigo, l.nombre AS lote_nombre
     FROM movimientos_contables m
     LEFT JOIN lotes l ON l.id = m.lote_id
     WHERE m.empresa_id = $1
     ORDER BY m.fecha DESC, m.creado_en DESC`,
    [empresaId]
  );
  return rows;
}

router.get('/movimientos', verificarAcceso(['ADMIN', 'TECNICO']), async (req, res) => {
  try {
    const rows = await listarMovimientos(req.usuario.empresa_id);
    return res.json(rows);
  } catch (err) {
    console.error('Error consultando movimientos:', err);
    return res.status(500).json({ error: 'Error al consultar movimientos financieros' });
  }
});

router.get('/gastos', verificarAcceso(['ADMIN', 'TECNICO']), async (req, res) => {
  try {
    const rows = await listarMovimientos(req.usuario.empresa_id);
    return res.json(rows);
  } catch (err) {
    console.error('Error consultando gastos:', err);
    return res.status(500).json({ error: 'Error al consultar gastos' });
  }
});

// Registrar movimiento financiero (GASTO, COMPRA o VENTA) + descontar animales vendidos y actualizar peso final
router.post('/gastos', verificarAcceso(['ADMIN']), upload.single('factura'), async (req, res) => {
  const {
    id,
    lote_id,
    tipo = 'GASTO',
    categoria,
    descripcion,
    cantidad_animales = 0,
    peso_final_kg = 0,
    monto,
    fecha
  } = req.body;

  if (!descripcion || monto === undefined || monto === '') {
    return res.status(400).json({ error: 'Descripción y monto son obligatorios' });
  }

  const movId = id || uuidv4();
  const tipoNormalizado = ['GASTO', 'COMPRA', 'VENTA'].includes(String(tipo).toUpperCase())
    ? String(tipo).toUpperCase()
    : 'GASTO';
  const montoNum = Number(monto || 0);
  const cantAnimales = Math.max(0, Number(cantidad_animales || 0));
  const pesoFinal = Number(peso_final_kg || 0);
  const urlFactura = req.file ? `/uploads/${req.file.filename}` : null;
  const fechaMov = fecha || new Date().toISOString().slice(0, 10);

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    let loteActualizado = null;
    if (lote_id) {
      const loteRes = await client.query(
        `SELECT * FROM lotes WHERE id = $1 AND empresa_id = $2`,
        [lote_id, req.usuario.empresa_id]
      );
      if (loteRes.rows.length > 0) {
        const lote = loteRes.rows[0];
        let nuevaCant = Number(lote.cantidad_actual ?? lote.cantidad_inicial ?? 0);
        let nuevaVenta = Number(lote.valor_venta_total || 0);
        let nuevaCompra = Number(lote.costo_compra_total || 0);
        let nuevoPesoFin = Number(lote.peso_final_kg || 0);

        if (tipoNormalizado === 'VENTA') {
          if (cantAnimales > 0) {
            nuevaCant = Math.max(0, nuevaCant - cantAnimales);
          }
          nuevaVenta += montoNum;
          if (pesoFinal > 0) {
            nuevoPesoFin = pesoFinal;
          }
        } else if (tipoNormalizado === 'COMPRA') {
          if (cantAnimales > 0) {
            nuevaCant = nuevaCant + cantAnimales;
          }
          nuevaCompra += montoNum;
        }

        const updRes = await client.query(
          `UPDATE lotes
           SET cantidad_actual = $1, valor_venta_total = $2, costo_compra_total = $3, peso_final_kg = $4
           WHERE id = $5 AND empresa_id = $6
           RETURNING *`,
          [nuevaCant, nuevaVenta, nuevaCompra, nuevoPesoFin, lote_id, req.usuario.empresa_id]
        );
        loteActualizado = updRes.rows[0];
      }
    }

    const { rows } = await client.query(
      `INSERT INTO movimientos_contables (
        id, empresa_id, lote_id, tipo, categoria, descripcion, cantidad_animales,
        peso_final_kg, monto, url_factura, fecha, creado_por
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        tipo = EXCLUDED.tipo,
        categoria = EXCLUDED.categoria,
        descripcion = EXCLUDED.descripcion,
        cantidad_animales = EXCLUDED.cantidad_animales,
        peso_final_kg = EXCLUDED.peso_final_kg,
        monto = EXCLUDED.monto,
        fecha = EXCLUDED.fecha
      RETURNING *`,
      [
        movId,
        req.usuario.empresa_id,
        lote_id || null,
        tipoNormalizado,
        categoria || (tipoNormalizado === 'VENTA' ? 'VENTA_ANIMAL' : tipoNormalizado),
        String(descripcion).trim(),
        cantAnimales,
        pesoFinal,
        montoNum,
        urlFactura,
        fechaMov,
        req.usuario.id
      ]
    );

    if (tipoNormalizado === 'VENTA' && lote_id) {
      await client.query(
        `INSERT INTO seguimientos (
          id, empresa_id, lote_id, usuario_id, autor_nombre, tipo_registro,
          valor_principal, alimento_kg, mortalidad, ingresos_animales, observaciones, fecha_registro
        )
        VALUES ($1,$2,$3,$4,$5,'VENTA_ANIMAL',$6,0,0,0,$7,$8)
        ON CONFLICT (id) DO NOTHING`,
        [
          `seg-venta-${movId}`,
          req.usuario.empresa_id,
          lote_id,
          req.usuario.id,
          req.usuario.nombre,
          pesoFinal > 0 ? pesoFinal : montoNum,
          `Venta de ${cantAnimales} animal(es) por $${montoNum.toLocaleString()} (Peso final: ${pesoFinal} kg) - ${String(descripcion).trim()}`,
          fechaMov
        ]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      movimiento: rows[0],
      ...rows[0],
      lote: loteActualizado
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error registrando movimiento:', err);
    return res.status(500).json({ error: err.detail || err.message || 'Error al registrar movimiento financiero' });
  } finally {
    if (client) client.release();
  }
});

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
      const montoNum = Number(m.monto || 0);
      const cantAnimales = Math.max(0, Number(m.cantidad_animales || 0));
      const pesoFinal = Number(m.peso_final_kg || 0);

      await client.query(
        `INSERT INTO movimientos_contables (
          id, empresa_id, lote_id, tipo, categoria, descripcion, cantidad_animales,
          peso_final_kg, monto, url_factura, fecha, creado_por
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO NOTHING`,
        [
          m.id,
          req.usuario.empresa_id,
          m.lote_id || null,
          tipoNormalizado,
          m.categoria || 'GENERAL',
          String(m.descripcion || 'Movimiento offline').trim(),
          cantAnimales,
          pesoFinal,
          montoNum,
          m.url_factura || null,
          m.fecha || new Date().toISOString().slice(0, 10),
          req.usuario.id
        ]
      );

      if (m.lote_id && tipoNormalizado === 'VENTA') {
        await client.query(
          `UPDATE lotes
           SET cantidad_actual = GREATEST(0, COALESCE(cantidad_actual, cantidad_inicial) - $1),
               valor_venta_total = COALESCE(valor_venta_total, 0) + $2,
               peso_final_kg = CASE WHEN $3 > 0 THEN $3 ELSE peso_final_kg END
           WHERE id = $4 AND empresa_id = $5`,
          [cantAnimales, montoNum, pesoFinal, m.lote_id, req.usuario.empresa_id]
        );
      }
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
