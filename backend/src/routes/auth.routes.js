const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../config/db');
const { JWT_SECRET } = require('../middlewares/auth');

// Registrar nueva Empresa + Usuario Administrador
router.post('/register', async (req, res) => {
  const { nombre_empresa, nit_rut, moneda, nombre_usuario, email, password } = req.body;

  try {
    // 1. Crear la empresa
    const empRes = await db.query(
      `INSERT INTO empresas (nombre, nit_rut, moneda)
       VALUES ($1, $2, $3) RETURNING id, nombre, moneda`,
      [nombre_empresa, nit_rut, moneda || 'COP']
    );
    const empresa = empRes.rows[0];

    // 2. Encriptar contraseña y crear el usuario ADMIN
    const password_hash = await bcrypt.hash(password, 10);
    const userRes = await db.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'ADMIN') RETURNING id, empresa_id, nombre, email, rol, activo`,
      [empresa.id, nombre_usuario, email, password_hash]
    );
    const usuario = userRes.rows[0];

    // 3. Generar token JWT
    const token = jwt.sign(
      { id: usuario.id, empresa_id: usuario.empresa_id, rol: usuario.rol, activo: usuario.activo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, usuario, empresa });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El NIT/RUT o el correo ya están registrados.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Iniciar sesión
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { rows } = await db.query(
      `SELECT u.*, e.nombre AS empresa_nombre, e.moneda
       FROM usuarios u
       JOIN empresas e ON u.empresa_id = e.id
       WHERE u.email = $1`,
      [email]
    );

    const usuario = rows[0];
    if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (!usuario.activo) return res.status(403).json({ error: 'Usuario desactivado' });

    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: usuario.id, empresa_id: usuario.empresa_id, rol: usuario.rol, activo: usuario.activo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        empresa_id: usuario.empresa_id
      },
      empresa: {
        id: usuario.empresa_id,
        nombre: usuario.empresa_nombre,
        moneda: usuario.moneda
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
