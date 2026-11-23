-- 1. Empresas (Multi-Tenant)
CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(150) NOT NULL,
  nit_rut VARCHAR(50) UNIQUE NOT NULL,
  moneda VARCHAR(10) DEFAULT 'COP',
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 2. Personal Autorizado por Empresa
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol VARCHAR(20) CHECK (rol IN ('ADMIN', 'TECNICO', 'OPERARIO')) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 3. Lotes Pecuarios (5 Especies)
CREATE TABLE IF NOT EXISTS lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  especie VARCHAR(30) CHECK (especie IN ('VACAS_LECHE', 'GANADO_CARNE', 'POLLOS_ENGORDE', 'GALLINAS_PONEDORAS', 'CERDOS')) NOT NULL,
  cantidad_inicial INT NOT NULL,
  cantidad_actual INT NOT NULL,
  costo_compra_total NUMERIC(14,2) DEFAULT 0,
  valor_venta_total NUMERIC(14,2) DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'ACTIVO',
  fecha_inicio DATE NOT NULL,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 4. Historial de Seguimientos (Leche, Pesajes, Postura)
CREATE TABLE IF NOT EXISTS seguimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  lote_id UUID REFERENCES lotes(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id),
  tipo_registro VARCHAR(30) NOT NULL,
  valor_principal NUMERIC(12,2) NOT NULL,
  alimento_kg NUMERIC(10,2) DEFAULT 0,
  mortalidad INT DEFAULT 0,
  observaciones TEXT,
  fecha_registro TIMESTAMP NOT NULL
);

-- 5. Ciclo Reproductivo Porcino
CREATE TABLE IF NOT EXISTS reproduccion_cerdas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  lote_id UUID REFERENCES lotes(id) ON DELETE CASCADE,
  arete_hembra VARCHAR(50) NOT NULL,
  fecha_monta DATE NOT NULL,
  fecha_probable_parto DATE NOT NULL,
  fecha_parto_real DATE,
  nacidos_machos INT DEFAULT 0,
  nacidos_hembras INT DEFAULT 0,
  nacidos_muertos INT DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'GESTACION'
);

-- 6. Contabilidad, Gastos y Facturas
CREATE TABLE IF NOT EXISTS movimientos_contables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL,
  categoria VARCHAR(50) NOT NULL,
  descripcion TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL,
  url_factura TEXT,
  fecha DATE NOT NULL,
  creado_por UUID REFERENCES usuarios(id)
);
