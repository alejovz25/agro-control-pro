const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const lotesRoutes = require('./routes/lotes.routes');
const finanzasRoutes = require('./routes/finanzas.routes');

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000'
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const esRender = origin.endsWith('.onrender.com');
    const estaEnLista = allowedOrigins.includes(origin);
    if (esRender || estaEnLista) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    proyecto: 'AgroControl Pro API',
    endpoints: ['/api/health', '/api/auth', '/api/lotes', '/api/finanzas']
  });
});

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, servicio: 'AgroControl Pro API', db: 'conectada' });
  } catch (err) {
    res.status(500).json({ ok: false, servicio: 'AgroControl Pro API', db_error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/lotes', lotesRoutes);
app.use('/api/finanzas', finanzasRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

db.inicializarBaseDeDatos()
  .then(() => {
    console.log('Base de datos inicializada correctamente');
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error inicializando base de datos:', err);
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT} (revisar DATABASE_URL)`);
    });
  });
