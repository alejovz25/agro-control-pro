const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'agrocontrol_pro_secret_2026';

function verificarAcceso(rolesPermitidos = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const partes = authHeader.split(' ');
    const token = partes.length === 2 && partes[0] === 'Bearer' ? partes[1] : null;

    if (!token || token === 'sesion_activa') {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
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
