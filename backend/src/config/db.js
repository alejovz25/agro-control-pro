const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const useSsl =
  Boolean(connectionString) &&
  (process.env.NODE_ENV === 'production' ||
    connectionString.includes('render.com') ||
    connectionString.includes('sslmode=require') ||
    !connectionString.includes('localhost'));

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

async function inicializarBaseDeDatos() {
  if (!connectionString) {
    throw new Error('Falta configurar DATABASE_URL en las variables de entorno');
  }

  const sql = `
    CREATE TABLE IF NOT EXISTS empresas (
      id UUID PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      nit_rut VARCHAR(60) NOT NULL,
      moneda VARCHAR(10) NOT NULL DEFAULT 'COP',
      creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id UUID PRIMARY KEY,
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nombre VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_visible TEXT,
      rol VARCHAR(20) NOT NULL CHECK (rol IN ('ADMIN', 'TECNICO', 'OPERARIO')),
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_visible TEXT;

    CREATE TABLE IF NOT EXISTS lotes (
      id UUID PRIMARY KEY,
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      codigo VARCHAR(50) NOT NULL,
      nombre VARCHAR(120) NOT NULL,
      especie VARCHAR(80) NOT NULL,
      cantidad_inicial INTEGER NOT NULL DEFAULT 0,
      cantidad_actual INTEGER NOT NULL DEFAULT 0,
      peso_inicial_animal_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
      peso_final_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
      costo_compra_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
      valor_venta_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
      fecha_inicio DATE NOT NULL,
      estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
      creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE lotes ADD COLUMN IF NOT EXISTS peso_inicial_animal_kg NUMERIC(12, 2) NOT NULL DEFAULT 0;
    ALTER TABLE lotes ADD COLUMN IF NOT EXISTS peso_final_kg NUMERIC(12, 2) NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS seguimientos (
      id UUID PRIMARY KEY,
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL,
      usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
      autor_nombre VARCHAR(150),
      tipo_registro VARCHAR(50) NOT NULL,
      valor_principal NUMERIC(14, 2) NOT NULL DEFAULT 0,
      alimento_kg NUMERIC(14, 2) NOT NULL DEFAULT 0,
      mortalidad INTEGER NOT NULL DEFAULT 0,
      ingresos_animales INTEGER NOT NULL DEFAULT 0,
      observaciones TEXT,
      fecha_registro DATE NOT NULL,
      creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS autor_nombre VARCHAR(150);
    ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS ingresos_animales INTEGER NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS movimientos_contables (
      id UUID PRIMARY KEY,
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL,
      tipo VARCHAR(20) NOT NULL DEFAULT 'GASTO',
      categoria VARCHAR(60) NOT NULL,
      descripcion TEXT NOT NULL,
      cantidad_animales INTEGER NOT NULL DEFAULT 0,
      peso_final_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
      monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
      url_factura TEXT,
      fecha DATE NOT NULL,
      creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
      creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE movimientos_contables ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'GASTO';
    ALTER TABLE movimientos_contables ADD COLUMN IF NOT EXISTS cantidad_animales INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE movimientos_contables ADD COLUMN IF NOT EXISTS peso_final_kg NUMERIC(12, 2) NOT NULL DEFAULT 0;
  `;

  await pool.query(sql);
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  pool,
  inicializarBaseDeDatos
};
