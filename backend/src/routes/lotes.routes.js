const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verificarAcceso } = require('../middlewares/auth');

// Obtener todos los lotes de la empresa del usuario logueado
router.get('/', verificarAcceso(), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM lotes WHERE empresa_id = $1 ORDER BY creado_en DESC',
      [req.usuario.empresa_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear lote (SOLO ADMINISTRADOR)
router.post('/', verificarAcceso(['ADMIN']), async (req, res) => {
  const { id, codigo, nombre, especie, cantidad_inicial, costo_compra_total, fecha_inicio } =
    req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO lotes (id, empresa_id, codigo, nombre, especie, cantidad_inicial, cantidad_actual, costo_compra_total, fecha_inicio)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8) RETURNING *`,
      [
        id,
        req.usuario.empresa_id,
        codigo,
        nombre,
        especie,
        cantidad_inicial,
        costo_compra_total,
        fecha_inicio
      ]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sincronización masiva desde modo Offline (Recibe lote de registros pendientes)
router.post('/sync', verificarAcceso(), async (req, res) => {
  const { seguimientos = [], gastos = [], partos = [] } = req.body;
  const empresaId = req.usuario.empresa_id;

  try {
    // 1. Insertar seguimientos evitando duplicados con ON CONFLICT (id) DO NOTHING
    for (const s of seguimientos) {
      await db.query(
        `INSERT INTO seguimientos (id, empresa_id, lote_id, usuario_id, tipo_registro, valor_principal, alimento_kg, mortalidad, observaciones, fecha_registro)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [
          s.id,
          empresaId,
          s.lote_id,
          req.usuario.id,
          s.tipo_registro,
          s.valor_principal,
          s.alimento_kg,
          s.mortalidad,
          s.observaciones,
          s.fecha_registro
        ]
      );
    }

    // 2. Insertar gastos (solo si el usuario que sincroniza es ADMIN)
    if (req.usuario.rol === 'ADMIN') {
      for (const g of gastos) {
        await db.query(
          `INSERT INTO movimientos_contables (id, empresa_id, lote_id, categoria, descripcion, monto, url_factura, fecha, creado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
          [
            g.id,
            empresaId,
            g.lote_id,
            g.categoria,
            g.descripcion,
            g.monto,
            g.url_factura,
            g.fecha,
            req.usuario.id
          ]
        );
      }
    }

    res.json({
      sincronizado: true,
      total: seguimientos.length + gastos.length + partos.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
