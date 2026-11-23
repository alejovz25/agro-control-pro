import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  PlusCircle,
  ClipboardList,
  DollarSign,
  Layers,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { db, sincronizarConServidor } from '../db/offlineDb';
import { exportarReporteContableExcel } from '../utils/exportExcel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const EMPRESA_ACTIVA = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Finca El Porvenir S.A.S.',
  moneda: 'COP'
};

const ESPECIES = [
  { value: 'VACAS_LECHE', label: 'Vacas de Leche', unidad: 'Litros' },
  { value: 'GANADO_CARNE', label: 'Ganado de Carne', unidad: 'Kg promedio' },
  { value: 'POLLOS_ENGORDE', label: 'Pollos de Engorde', unidad: 'Kg promedio' },
  { value: 'GALLINAS_PONEDORAS', label: 'Gallinas Ponedoras', unidad: 'Huevos' },
  { value: 'CERDOS', label: 'Cerdos', unidad: 'Kg promedio' }
];

export default function DashboardPecuario() {
  const [online, setOnline] = useState(navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [tab, setTab] = useState('lotes'); // lotes | seguimientos | gastos

  // Datos reactivos desde IndexedDB (Dexie)
  const lotes = useLiveQuery(() => db.lotes.toArray(), []) ?? [];
  const seguimientos = useLiveQuery(() => db.seguimientos.toArray(), []) ?? [];
  const gastos = useLiveQuery(() => db.gastos.toArray(), []) ?? [];

  // Formularios
  const [nuevoLote, setNuevoLote] = useState({
    codigo: '',
    nombre: '',
    especie: 'VACAS_LECHE',
    cantidad_inicial: '',
    costo_compra_total: '',
    fecha_inicio: new Date().toISOString().slice(0, 10)
  });

  const [nuevoSeguimiento, setNuevoSeguimiento] = useState({
    lote_id: '',
    tipo_registro: 'LECHE',
    valor_principal: '',
    alimento_kg: '',
    mortalidad: '0',
    observaciones: ''
  });

  const [nuevoGasto, setNuevoGasto] = useState({
    lote_id: '',
    categoria: 'ALIMENTO',
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    nombre_archivo: ''
  });

  useEffect(() => {
    const onStatusChange = () => setOnline(navigator.onLine);
    window.addEventListener('online', onStatusChange);
    window.addEventListener('offline', onStatusChange);
    return () => {
      window.removeEventListener('online', onStatusChange);
      window.removeEventListener('offline', onStatusChange);
    };
  }, []);

  useEffect(() => {
    if (lotes.length > 0) {
      setNuevoSeguimiento((prev) => ({ ...prev, lote_id: prev.lote_id || lotes[0].id }));
      setNuevoGasto((prev) => ({ ...prev, lote_id: prev.lote_id || lotes[0].id }));
    }
  }, [lotes]);

  const notificar = (texto) => {
    setMensaje(texto);
    setTimeout(() => setMensaje(''), 4000);
  };

  const handleCrearLote = async (e) => {
    e.preventDefault();
    if (!nuevoLote.codigo || !nuevoLote.nombre || !nuevoLote.cantidad_inicial) return;

    const cant = Number(nuevoLote.cantidad_inicial);
    const loteObj = {
      id: uuidv4(),
      empresa_id: EMPRESA_ACTIVA.id,
      codigo: nuevoLote.codigo.trim(),
      nombre: nuevoLote.nombre.trim(),
      especie: nuevoLote.especie,
      cantidad_inicial: cant,
      cantidad_actual: cant,
      costo_compra_total: Number(nuevoLote.costo_compra_total || 0),
      valor_venta_total: 0,
      estado: 'ACTIVO',
      fecha_inicio: nuevoLote.fecha_inicio
    };

    await db.lotes.add(loteObj);
    setNuevoLote({
      codigo: '',
      nombre: '',
      especie: 'VACAS_LECHE',
      cantidad_inicial: '',
      costo_compra_total: '',
      fecha_inicio: new Date().toISOString().slice(0, 10)
    });
    notificar('Lote guardado localmente en IndexedDB.');
  };

  const handleGuardarSeguimiento = async (e) => {
    e.preventDefault();
    if (!nuevoSeguimiento.lote_id || !nuevoSeguimiento.valor_principal) return;

    const segObj = {
      id: uuidv4(),
      empresa_id: EMPRESA_ACTIVA.id,
      lote_id: nuevoSeguimiento.lote_id,
      tipo_registro: nuevoSeguimiento.tipo_registro,
      valor_principal: Number(nuevoSeguimiento.valor_principal),
      alimento_kg: Number(nuevoSeguimiento.alimento_kg || 0),
      mortalidad: Number(nuevoSeguimiento.mortalidad || 0),
      observaciones: nuevoSeguimiento.observaciones.trim(),
      fecha_registro: new Date().toISOString(),
      sincronizado: 0
    };

    await db.seguimientos.add(segObj);

    // Actualizar cantidad actual si hubo mortalidad
    if (segObj.mortalidad > 0) {
      const loteActual = await db.lotes.get(segObj.lote_id);
      if (loteActual) {
        const nuevaCant = Math.max(0, Number(loteActual.cantidad_actual) - segObj.mortalidad);
        await db.lotes.update(segObj.lote_id, { cantidad_actual: nuevaCant });
      }
    }

    setNuevoSeguimiento((prev) => ({
      ...prev,
      valor_principal: '',
      alimento_kg: '',
      mortalidad: '0',
      observaciones: ''
    }));
    notificar('Seguimiento registrado (pendiente de sincronizar).');
  };

  const handleGuardarGasto = async (e) => {
    e.preventDefault();
    if (!nuevoGasto.descripcion || !nuevoGasto.monto) return;

    const gastoObj = {
      id: uuidv4(),
      empresa_id: EMPRESA_ACTIVA.id,
      lote_id: nuevoGasto.lote_id || null,
      categoria: nuevoGasto.categoria,
      descripcion: nuevoGasto.descripcion.trim(),
      monto: Number(nuevoGasto.monto),
      fecha: nuevoGasto.fecha,
      nombre_archivo: nuevoGasto.nombre_archivo || '',
      url_factura: '',
      sincronizado: 0
    };

    await db.gastos.add(gastoObj);
    setNuevoGasto((prev) => ({
      ...prev,
      descripcion: '',
      monto: '',
      nombre_archivo: ''
    }));
    notificar('Gasto guardado en base local.');
  };

  const handleSincronizar = async () => {
    const token = localStorage.getItem('agro_token');
    if (!token) {
      notificar('Guarda un JWT en localStorage ("agro_token") para enviar al servidor.');
      return;
    }
    setSincronizando(true);
    try {
      const res = await sincronizarConServidor(API_URL, token);
      if (res.status === 'offline') notificar('Sin conexión a internet.');
      else if (res.status === 'up_to_date') notificar('Todo está sincronizado.');
      else if (res.status === 'synced') notificar(`Sincronizados ${res.count} registros.`);
      else notificar('Error al sincronizar con el servidor.');
    } finally {
      setSincronizando(false);
    }
  };

  const pendientesCount =
    seguimientos.filter((s) => s.sincronizado === 0).length +
    gastos.filter((g) => g.sincronizado === 0).length;

  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto || 0), 0);
  const totalAnimales = lotes.reduce((acc, l) => acc + Number(l.cantidad_actual || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Encabezado */}
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">AgroControl Pro</h1>
            <p className="text-xs text-green-100">
              {EMPRESA_ACTIVA.nombre} • Moneda: {EMPRESA_ACTIVA.moneda}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                online ? 'bg-green-700 text-green-100' : 'bg-amber-600 text-white'
              }`}
            >
              {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {online ? 'En línea' : 'Modo Offline'}
            </span>

            <button
              type="button"
              onClick={handleSincronizar}
              disabled={sincronizando}
              className="inline-flex items-center gap-1.5 bg-white text-green-900 hover:bg-green-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              Sincronizar ({pendientesCount})
            </button>

            <button
              type="button"
              onClick={() =>
                exportarReporteContableExcel(EMPRESA_ACTIVA.nombre, lotes, gastos, seguimientos)
              }
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar .XLSX
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {mensaje && (
          <div className="bg-green-50 border border-green-300 text-green-900 px-4 py-2.5 rounded-lg text-sm">
            {mensaje}
          </div>
        )}

        {/* Tarjetas de resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Lotes Activos</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{lotes.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Animales / Aves en Inventario</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalAnimales}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Gastos Registrados</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              ${totalGastos.toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        {/* Navegación por pestañas */}
        <div className="flex gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setTab('lotes')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'lotes' ? 'bg-green-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" /> Lotes
          </button>
          <button
            type="button"
            onClick={() => setTab('seguimientos')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'seguimientos'
                ? 'bg-green-700 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Seguimientos
          </button>
          <button
            type="button"
            onClick={() => setTab('gastos')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'gastos' ? 'bg-green-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <DollarSign className="w-4 h-4" /> Gastos y Facturas
          </button>
        </div>

        {/* Pestaña 1: Lotes */}
        {tab === 'lotes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form
              onSubmit={handleCrearLote}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 h-fit"
            >
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-green-700" /> Nuevo Lote Pecuario
              </h2>
              <input
                type="text"
                placeholder="Código (ej. LT-001)"
                value={nuevoLote.codigo}
                onChange={(e) => setNuevoLote({ ...nuevoLote, codigo: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="text"
                placeholder="Nombre del lote"
                value={nuevoLote.nombre}
                onChange={(e) => setNuevoLote({ ...nuevoLote, nombre: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <select
                value={nuevoLote.especie}
                onChange={(e) => setNuevoLote({ ...nuevoLote, especie: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {ESPECIES.map((esp) => (
                  <option key={esp.value} value={esp.value}>
                    {esp.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                placeholder="Cantidad inicial"
                value={nuevoLote.cantidad_inicial}
                onChange={(e) => setNuevoLote({ ...nuevoLote, cantidad_inicial: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Costo compra total ($)"
                value={nuevoLote.costo_compra_total}
                onChange={(e) => setNuevoLote({ ...nuevoLote, costo_compra_total: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={nuevoLote.fecha_inicio}
                onChange={(e) => setNuevoLote({ ...nuevoLote, fecha_inicio: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded-lg text-sm font-semibold"
              >
                Guardar Lote
              </button>
            </form>

            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Lotes Registrados</h2>
              {lotes.length === 0 ? (
                <p className="text-sm text-slate-500">Aún no hay lotes creados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="p-2">Código</th>
                        <th className="p-2">Nombre</th>
                        <th className="p-2">Especie</th>
                        <th className="p-2">Actual</th>
                        <th className="p-2">Compra</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lotes.map((l) => (
                        <tr key={l.id}>
                          <td className="p-2 font-mono">{l.codigo}</td>
                          <td className="p-2">{l.nombre}</td>
                          <td className="p-2">{l.especie}</td>
                          <td className="p-2 font-semibold">{l.cantidad_actual}</td>
                          <td className="p-2">${Number(l.costo_compra_total).toLocaleString('es-CO')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pestaña 2: Seguimientos */}
        {tab === 'seguimientos' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form
              onSubmit={handleGuardarSeguimiento}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 h-fit"
            >
              <h2 className="font-semibold text-slate-800">Registrar Control Productivo</h2>
              <select
                value={nuevoSeguimiento.lote_id}
                onChange={(e) => setNuevoSeguimiento({ ...nuevoSeguimiento, lote_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Selecciona un lote</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} - {l.nombre}
                  </option>
                ))}
              </select>
              <select
                value={nuevoSeguimiento.tipo_registro}
                onChange={(e) =>
                  setNuevoSeguimiento({ ...nuevoSeguimiento, tipo_registro: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="LECHE">Leche (Litros)</option>
                <option value="PESAJE">Pesaje (Kg promedio)</option>
                <option value="POSTURA">Postura (Huevos)</option>
                <option value="MORTALIDAD">Mortalidad</option>
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Valor principal (litros, kg o huevos)"
                value={nuevoSeguimiento.valor_principal}
                onChange={(e) =>
                  setNuevoSeguimiento({ ...nuevoSeguimiento, valor_principal: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="Alimento consumido (kg)"
                value={nuevoSeguimiento.alimento_kg}
                onChange={(e) =>
                  setNuevoSeguimiento({ ...nuevoSeguimiento, alimento_kg: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                placeholder="Mortalidad (unidades)"
                value={nuevoSeguimiento.mortalidad}
                onChange={(e) =>
                  setNuevoSeguimiento({ ...nuevoSeguimiento, mortalidad: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Observaciones"
                value={nuevoSeguimiento.observaciones}
                onChange={(e) =>
                  setNuevoSeguimiento({ ...nuevoSeguimiento, observaciones: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded-lg text-sm font-semibold"
              >
                Guardar Seguimiento
              </button>
            </form>

            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Historial de Seguimientos</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {seguimientos.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border border-slate-100 rounded-lg p-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">
                        {s.tipo_registro}: {s.valor_principal}
                      </p>
                      <p className="text-xs text-slate-500">
                        Alimento: {s.alimento_kg} kg • Mortalidad: {s.mortalidad} •{' '}
                        {new Date(s.fecha_registro).toLocaleString('es-CO')}
                      </p>
                    </div>
                    {s.sincronizado ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="w-4 h-4" /> Sync
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <Clock className="w-4 h-4" /> Pendiente
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pestaña 3: Gastos */}
        {tab === 'gastos' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form
              onSubmit={handleGuardarGasto}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 h-fit"
            >
              <h2 className="font-semibold text-slate-800">Registrar Gasto / Factura</h2>
              <select
                value={nuevoGasto.lote_id}
                onChange={(e) => setNuevoGasto({ ...nuevoGasto, lote_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Gasto general de empresa</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} - {l.nombre}
                  </option>
                ))}
              </select>
              <select
                value={nuevoGasto.categoria}
                onChange={(e) => setNuevoGasto({ ...nuevoGasto, categoria: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="ALIMENTO">Alimento</option>
                <option value="MEDICAMENTOS">Medicamentos</option>
                <option value="NOMINA">Nómina</option>
                <option value="COMPRA_ANIMALES">Compra de animales</option>
                <option value="SERVICIOS">Servicios</option>
              </select>
              <input
                type="text"
                placeholder="Descripción del gasto"
                value={nuevoGasto.descripcion}
                onChange={(e) => setNuevoGasto({ ...nuevoGasto, descripcion: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto ($)"
                value={nuevoGasto.monto}
                onChange={(e) => setNuevoGasto({ ...nuevoGasto, monto: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="date"
                value={nuevoGasto.fecha}
                onChange={(e) => setNuevoGasto({ ...nuevoGasto, fecha: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="file"
                accept="image/*,.pdf,.xml"
                onChange={(e) =>
                  setNuevoGasto({
                    ...nuevoGasto,
                    nombre_archivo: e.target.files?.[0]?.name || ''
                  })
                }
                className="w-full text-xs text-slate-600"
              />
              <button
                type="submit"
                className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded-lg text-sm font-semibold"
              >
                Guardar Gasto
              </button>
            </form>

            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Movimientos Contables</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="p-2">Fecha</th>
                      <th className="p-2">Categoría</th>
                      <th className="p-2">Descripción</th>
                      <th className="p-2">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gastos.map((g) => (
                      <tr key={g.id}>
                        <td className="p-2">{g.fecha}</td>
                        <td className="p-2">{g.categoria}</td>
                        <td className="p-2">{g.descripcion}</td>
                        <td className="p-2 font-semibold">
                          ${Number(g.monto).toLocaleString('es-CO')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}