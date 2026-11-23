const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const lotesRoutes = require('./routes/lotes.routes');
const finanzasRoutes = require('./routes/finanzas.routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, servicio: 'AgroControl Pro API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/lotes', lotesRoutes);
app.use('/api/finanzas', finanzasRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor AgroControl Pro ejecutándose en http://localhost:${PORT}`);
});
