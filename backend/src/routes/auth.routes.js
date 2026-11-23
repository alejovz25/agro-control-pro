const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { verificarAcceso } = require('../middlewares/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'agrocontrol_dev_secret';

function firmarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      empresa_id: usuario.empresa_id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Registrar empresa + primer usuario ADMIN
router.post('/register-empresa', async (req, res) => {
  const {
    nombre_empresa,
    nit_rut,
    moneda = 'COP',
    nombre_admin,
    email,
    password
  } = req.body;

  if (!nombre_empresa || !nit_rut || !nombre_admin || !email || !password) {
    return res.status(400).json({
      error: 'Nombre de empresa, NIT/RUT, nombre del administrador, correo y contraseña son obligatorios'
    });
  }

  const emailNormalizado = String(email).trim().toLowerCase();

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE LOWER(email) = $1', [
      emailNormalizado
    ]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario registrado con ese correo' });
    }

    const empresaId = uuidv4();
    const usuarioId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('BEGIN');

    const empresaRes = await db.query(
      `INSERT INTO empresas (id, nombre, nit_rut, moneda)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, nit_rut, moneda`,
      [empresaId, String(nombre_empresa).trim(), String(nit_rut).trim(), moneda]
    );

    const usuarioRes = await db.query(
      `INSERT INTO usuarios (id, empresa_id, nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', TRUE)
       RETURNING id, empresa_id, nombre, email, rol`,
      [usuarioId, empresaId, String(nombre_admin).trim(), emailNormalizado, passwordHash]
    );

    await db.query('COMMIT');

    const usuario = usuarioRes.rows[0];
    const empresa = empresaRes.rows[0];
    const token = firmarToken(usuario);

    return res.status(201).json({
      token,
      usuario,
      empresa
    });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error en /register-empresa:', error);
    return res.status(500).json({ error: error.message || 'Error al registrar la empresa' });
  }
});

// Iniciar sesión (ADMIN, TECNICO, OPERARIO)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  }

  const emailNormalizado = String(email).trim().toLowerCase();

  try {
    const { rows } = await db.query(
      `SELECT id, empresa_id, nombre, email, password_hash, rol, activo
       FROM usuarios
       WHERE LOWER(email) = $1`,
      [emailNormalizado]
    );

    const row = rows[0];
    if (!row || row.activo === false) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const coincide = await bcrypt.compare(password, row.password_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = {
      id: row.id,
      empresa_id: row.empresa_id,
      nombre: row.nombre,
      email: row.email,
      rol: row.rol
    };

    const token = firmarToken(usuario);
    return res.json({ token, usuario });
  } catch (error) {
    console.error('Error en /login:', error);
    return res.status(500).json({ error: error.message || 'Error al iniciar sesión' });
  }
});

// Crear trabajador dentro de la empresa del ADMIN
router.post('/usuarios', verificarAcceso(['ADMIN']), async (req, res) => {
  const { nombre, email, password, rol = 'OPERARIO' } = req.body;
  const rolesPermitidos = ['ADMIN', 'TECNICO', 'OPERARIO'];

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
  }

  if (!rolesPermitidos.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  const emailNormalizado = String(email).trim().toLowerCase();

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE LOWER(email) = $1', [
      emailNormalizado
    ]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }

    const nuevoId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await db.query(
      `INSERT INTO usuarios (id, empresa_id, nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, empresa_id, nombre, email, rol`,
      [nuevoId, req.usuario.empresa_id, String(nombre).trim(), emailNormalizado, passwordHash, rol]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error en /usuarios:', error);
    return res.status(500).json({ error: error.message || 'Error al crear trabajador' });
  }
});

module.exports = router;
