const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
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
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// Listar gastos/movimientos contables de la empresa (ADMIN y TECNICO)
router.get('/gastos', verificarAcceso(['ADMIN', 'TECNICO']), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM movimientos_contables
       WHERE empresa_id = $1
       ORDER BY fecha DESC`,
      [req.usuario.empresa_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar gasto con archivo adjunto (SOLO ADMIN)
router.post('/gastos', verificarAcceso(['ADMIN']), upload.single('factura'), async (req, res) => {
  const { id, lote_id, categoria, descripcion, monto, fecha } = req.body;

  if (!categoria || !descripcion || !monto || !fecha) {
    return res.status(400).json({ error: 'Categoría, descripción, monto y fecha son requeridos' });
  }

  const gastoId = id || uuidv4();
  const urlFactura = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const { rows } = await db.query(
      `INSERT INTO movimientos_contables
        (id, empresa_id, lote_id, categoria, descripcion, monto, url_factura, fecha, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [
        gastoId,
        req.usuario.empresa_id,
        lote_id || null,
        categoria,
        descripcion.trim(),
        Number(monto),
        urlFactura,
        fecha,
        req.usuario.id
      ]
    );

    res.status(201).json(rows[0] || { id: gastoId, duplicado: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sincronización de gastos offline en lote (SOLO ADMIN)
router.post('/sync', verificarAcceso(['ADMIN']), async (req, res) => {
  const { gastos = [] } = req.body;

  try {
    for (const g of gastos) {
      await db.query(
        `INSERT INTO movimientos_contables
          (id, empresa_id, lote_id, categoria, descripcion, monto, url_factura, fecha, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          g.id || uuidv4(),
          req.usuario.empresa_id,
          g.lote_id || null,
          g.categoria,
          g.descripcion,
          Number(g.monto),
          g.url_factura || null,
          g.fecha,
          req.usuario.id
        ]
      );
    }

    res.json({ sincronizado: true, total: gastos.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
