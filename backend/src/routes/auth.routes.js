const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { JWT_SECRET, verificarAcceso } = require('../middlewares/auth');

const router = express.Router();

// Registrar nueva empresa y su primer usuario ADMIN
router.post('/register-empresa', async (req, res) => {
  const { nombre_empresa, nit_rut, moneda = 'COP', nombre_admin, email, password } = req.body;

  if (!nombre_empresa || !nit_rut || !nombre_admin || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const empresaId = uuidv4();
    const usuarioId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('BEGIN');

    await db.query(
      `INSERT INTO empresas (id, nombre, nit_rut, moneda)
       VALUES ($1, $2, $3, $4)`,
      [empresaId, nombre_empresa.trim(), nit_rut.trim(), moneda]
    );

    await db.query(
      `INSERT INTO usuarios (id, empresa_id, nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', TRUE)`,
      [usuarioId, empresaId, nombre_admin.trim(), email.trim().toLowerCase(), passwordHash]
    );

    await db.query('COMMIT');

    const token = jwt.sign(
      { id: usuarioId, empresa_id: empresaId, rol: 'ADMIN', activo: true },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      usuario: { id: usuarioId, empresa_id: empresaId, nombre: nombre_admin, email, rol: 'ADMIN' }
    });
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// Login de usuario (ADMIN, TECNICO, OPERARIO)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, empresa_id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    const usuario = rows[0];
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!usuario.activo) {
      return res.status(403).json({ error: 'Usuario desactivado por el administrador' });
    }

    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        empresa_id: usuario.empresa_id,
        rol: usuario.rol,
        activo: usuario.activo
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        empresa_id: usuario.empresa_id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear personal de la misma empresa (SOLO ADMIN)
router.post('/usuarios', verificarAcceso(['ADMIN']), async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  if (!['ADMIN', 'TECNICO', 'OPERARIO'].includes(rol)) {
    return res.status(400).json({ error: 'Rol no válido' });
  }

  try {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await db.query(
      `INSERT INTO usuarios (id, empresa_id, nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, empresa_id, nombre, email, rol, activo`,
      [id, req.usuario.empresa_id, nombre.trim(), email.trim().toLowerCase(), passwordHash, rol]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
