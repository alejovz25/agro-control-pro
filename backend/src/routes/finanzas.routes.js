const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_agrocontrol_2026';

// Verifica token y aísla automáticamente los datos por empresa_id
function verificarAcceso(rolesPermitidos = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.activo) {
        return res.status(403).json({ error: 'Usuario desactivado por el administrador' });
      }

      if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(decoded.rol)) {
        return res.status(403).json({ error: 'No tienes permisos para esta acción' });
      }

      req.usuario = decoded; // Contiene: id, empresa_id, rol, activo
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }
  };
}

module.exports = router;
