const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'agrocontrol_pro_secret_2026';

function verificarAcceso(rolesPermitidos = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers['x-access-token'] || '';
    let token = '';

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (typeof authHeader === 'string') {
      token = authHeader.trim();
    }

    if (!token || token === 'null' || token === 'undefined' || token === 'sesion_activa') {
      return res.status(401).json({ error: 'Sesión inválida o expirada (sin token)' });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.usuario = {
        id: payload.id,
        empresa_id: payload.empresa_id,
        nombre: payload.nombre,
        email: payload.email,
        rol: String(payload.rol || '').toUpperCase()
      };

      if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(req.usuario.rol)) {
        return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
      }

      return next();
    } catch (_err) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }
  };
}

module.exports = { verificarAcceso, JWT_SECRET };
