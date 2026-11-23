import React, { useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import db from './utils/offlineDb';
import { exportarReporteContableExcel } from './utils/exportExcel';
import LoginView from './components/LoginView';
import CrearTrabajadorModal from './components/CrearTrabajadorModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('agro_token') || '');
  const [usuario, setUsuario] = useState(() => {
    try {
      const saved = localStorage.getItem('agro_usuario');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [online, setOnline] = useState(() => navigator.onLine);
  const [mostrarModalTrabajador, setMostrarModalTrabajador] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState('');

  // Datos principales
  const [lotes, setLotes] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [seguimientos, setSeguimientos] = useState([]);

  // Formulario nuevo lote (solo ADMIN)
  const [nuevoLote, setNuevoLote] = useState({
    codigo: '',
    nombre: '',
    especie: 'Bovinos',
    cantidad_inicial: '',
    costo_compra_total: '',
    fecha_inicio: new Date().toISOString().slice(0, 10)
  });

  // Formulario seguimiento diario
  const [nuevoSeg, setNuevoSeg] = useState({
    lote_id: '',
    tipo_registro: 'LECHE_LITROS',
    valor_principal: '',
    alimento_kg: '',
    mortalidad: '0',
    observaciones: '',
    fecha_registro: new Date().toISOString().slice(0, 10)
  });

  // Formulario gasto / factura (solo ADMIN)
  const [nuevoGasto, setNuevoGasto] = useState({
    lote_id: '',
    categoria: 'ALIMENTO',
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    archivo: null
  });

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem('agro_token');
    localStorage.removeItem('agro_usuario');
    setToken('');
    setUsuario(null);
    setLotes([]);
    setGastos([]);
    setSeguimientos([]);
    setMensajeEstado('');
  }, []);

  const cargarDatosLocales = useCallback(async () => {
    try {
      const [lotesLocal, gastosLocal, segLocal] = await Promise.all([
        db.lotes ? db.lotes.toArray() : [],
        db.gastos ? db.gastos.toArray() : [],
        db.seguimientos ? db.seguimientos.toArray() : []
      ]);
      setLotes(lotesLocal);
      setGastos(gastosLocal);
      setSeguimientos(segLocal);
    } catch {
      // Si offlineDb usa otra estructura, evita bloquear la vista
    }
  }, []);

  const cargarDatosServidor = useCallback(async () => {
    if (!token || !navigator.onLine) return;

    const headers = { Authorization: `Bearer ${token}` };

    try {
      const resLotes = await fetch(`${API_URL}/api/lotes`, { headers });
      if (resLotes.status === 401) {
        cerrarSesion();
        return;
      }
      if (resLotes.ok) {
        const dataLotes = await resLotes.json();
        setLotes(dataLotes);
        if (db.lotes) {
          await db.lotes.clear();
          await db.lotes.bulkPut(dataLotes);
        }
      }

      if (usuario?.rol === 'ADMIN' || usuario?.rol === 'TECNICO') {
        const resGastos = await fetch(`${API_URL}/api/finanzas/gastos`, { headers });
        if (resGastos.ok) {
          const dataGastos = await resGastos.json();
          setGastos(dataGastos);
          if (db.gastos) {
            await db.gastos.clear();
            await db.gastos.bulkPut(dataGastos);
          }
        }
      }
    } catch {
      setMensajeEstado('Sin conexión con el servidor; mostrando datos locales.');
    }
  }, [token, usuario?.rol, cerrarSesion]);

  const handleSincronizarTodo = useCallback(async () => {
    if (!navigator.onLine || !token) {
      setMensajeEstado('Necesitas conexión a internet para sincronizar.');
      return;
    }

    setSincronizando(true);
    try {
      const pendientesSeg = seguimientos.filter((s) => s.pendiente_sync);
      const pendientesGastos = gastos.filter((g) => g.pendiente_sync);

      if (pendientesSeg.length > 0) {
        const resSeg = await fetch(`${API_URL}/api/lotes/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ seguimientos: pendientesSeg })
        });
        if (!resSeg.ok) throw new Error('Error sincronizando seguimientos');
      }

      if (usuario?.rol === 'ADMIN' && pendientesGastos.length > 0) {
        const resGastos = await fetch(`${API_URL}/api/finanzas/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ gastos: pendientesGastos })
        });
        if (!resGastos.ok) throw new Error('Error sincronizando gastos');
      }

      if (pendientesSeg.length > 0 || pendientesGastos.length > 0) {
        setSeguimientos((prev) => prev.map((item) => ({ ...item, pendiente_sync: false })));
        setGastos((prev) => prev.map((item) => ({ ...item, pendiente_sync: false })));
        await cargarDatosServidor();
        setMensajeEstado('Sincronización completada con el servidor.');
      }
    } catch (err) {
      setMensajeEstado(err.message);
    } finally {
      setSincronizando(false);
    }
  }, [token, usuario?.rol, seguimientos, gastos, cargarDatosServidor]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      handleSincronizarTodo();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleSincronizarTodo]);

  useEffect(() => {
    if (!token || !usuario) return;
    cargarDatosLocales();
    cargarDatosServidor();
  }, [token, usuario, cargarDatosLocales, cargarDatosServidor]);

  const handleLoginSuccess = (data) => {
    if (data.token) localStorage.setItem('agro_token', data.token);
    if (data.usuario) localStorage.setItem('agro_usuario', JSON.stringify(data.usuario));
    setToken(data.token);
    setUsuario(data.usuario);
    setMensajeEstado(`Bienvenido, ${data.usuario.nombre} (${data.usuario.rol})`);
  };

  const handleCrearLote = async (e) => {
    e.preventDefault();
    if (usuario?.rol !== 'ADMIN') return;

    const lotePayload = {
      id: uuidv4(),
      codigo: nuevoLote.codigo.trim(),
      nombre: nuevoLote.nombre.trim(),
      especie: nuevoLote.especie,
      cantidad_inicial: Number(nuevoLote.cantidad_inicial),
      cantidad_actual: Number(nuevoLote.cantidad_inicial),
      costo_compra_total: Number(nuevoLote.costo_compra_total || 0),
      valor_venta_total: 0,
      fecha_inicio: nuevoLote.fecha_inicio,
      estado: 'ACTIVO'
    };

    try {
      if (online) {
        const res = await fetch(`${API_URL}/api/lotes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(lotePayload)
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'No se pudo crear el lote');
        }
        const creado = await res.json();
        setLotes((prev) => [creado, ...prev]);
        if (db.lotes) await db.lotes.put(creado);
      } else {
        setLotes((prev) => [lotePayload, ...prev]);
        if (db.lotes) await db.lotes.put(lotePayload);
      }

      setNuevoLote({
        codigo: '',
        nombre: '',
        especie: 'Bovinos',
        cantidad_inicial: '',
        costo_compra_total: '',
        fecha_inicio: new Date().toISOString().slice(0, 10)
      });
      setMensajeEstado('Lote guardado correctamente.');
    } catch (err) {
      setMensajeEstado(err.message);
    }
  };

  const handleRegistrarSeguimiento = async (e) => {
    e.preventDefault();
    const registro = {
      id: uuidv4(),
      lote_id: nuevoSeg.lote_id || lotes[0]?.id || '',
      tipo_registro: nuevoSeg.tipo_registro,
      valor_principal: Number(nuevoSeg.valor_principal || 0),
      alimento_kg: Number(nuevoSeg.alimento_kg || 0),
      mortalidad: Number(nuevoSeg.mortalidad || 0),
      observaciones: nuevoSeg.observaciones.trim(),
      fecha_registro: nuevoSeg.fecha_registro,
      pendiente_sync: !online
    };

    setSeguimientos((prev) => [registro, ...prev]);
    if (db.seguimientos) await db.seguimientos.put(registro);

    setNuevoSeg((prev) => ({
      ...prev,
      valor_principal: '',
      alimento_kg: '',
      mortalidad: '0',
      observaciones: ''
    }));

    setMensajeEstado(
      online
        ? 'Seguimiento registrado localmente y listo para sincronizar.'
        : 'Sin conexión: seguimiento guardado en el dispositivo (IndexedDB).'
    );
  };

  const handleRegistrarGasto = async (e) => {
    e.preventDefault();
    if (usuario?.rol !== 'ADMIN') return;

    try {
      if (online) {
        const formData = new FormData();
        formData.append('id', uuidv4());
        formData.append('lote_id', nuevoGasto.lote_id);
        formData.append('categoria', nuevoGasto.categoria);
        formData.append('descripcion', nuevoGasto.descripcion.trim());
        formData.append('monto', String(nuevoGasto.monto));
        formData.append('fecha', nuevoGasto.fecha);
        if (nuevoGasto.archivo) {
          formData.append('factura', nuevoGasto.archivo);
        }

        const res = await fetch(`${API_URL}/api/finanzas/gastos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Error al registrar gasto');
        }
        const creado = await res.json();
        setGastos((prev) => [creado, ...prev]);
        if (db.gastos) await db.gastos.put(creado);
      } else {
        const gastoOffline = {
          id: uuidv4(),
          lote_id: nuevoGasto.lote_id || null,
          categoria: nuevoGasto.categoria,
          descripcion: nuevoGasto.descripcion.trim(),
          monto: Number(nuevoGasto.monto),
          fecha: nuevoGasto.fecha,
          nombre_archivo: nuevoGasto.archivo ? nuevoGasto.archivo.name : null,
          pendiente_sync: true
        };
        setGastos((prev) => [gastoOffline, ...prev]);
        if (db.gastos) await db.gastos.put(gastoOffline);
      }

      setNuevoGasto({
        lote_id: '',
        categoria: 'ALIMENTO',
        descripcion: '',
        monto: '',
        fecha: new Date().toISOString().slice(0, 10),
        archivo: null
      });
      setMensajeEstado('Movimiento contable registrado.');
    } catch (err) {
      setMensajeEstado(err.message);
    }
  };

  if (!token || !usuario) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const esAdmin = usuario.rol === 'ADMIN';
  const totalPendientes =
    seguimientos.filter((s) => s.pendiente_sync).length +
    gastos.filter((g) => g.pendiente_sync).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Barra superior */}
      <header className="bg-emerald-900 text-white px-4 py-3 shadow">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">AgroControl Pro</h1>
            <p className="text-xs text-emerald-200">
              {usuario.nombre} &bull; Rol: <span className="font-semibold">{usuario.rol}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                online ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950'
              }`}
            >
              {online ? 'En línea' : 'Modo Offline'}
            </span>

            <button
              type="button"
              onClick={handleSincronizarTodo}
              disabled={!online || sincronizando}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-xs font-semibold"
            >
              {sincronizando
                ? 'Sincronizando...'
                : `Sincronizar${totalPendientes > 0 ? ` (${totalPendientes})` : ''}`}
            </button>

            {esAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setMostrarModalTrabajador(true)}
                  className="px-3 py-1.5 rounded-lg bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-semibold"
                >
                  + Trabajador
                </button>

                <button
                  type="button"
                  onClick={() =>
                    exportarReporteContableExcel(
                      `Empresa_${usuario.empresa_id?.slice(0, 8) || 'Agro'}`,
                      lotes,
                      gastos,
                      seguimientos
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-semibold"
                >
                  Exportar Excel
                </button>
              </>
            )}

            <button
              type="button"
              onClick={cerrarSesion}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {mensajeEstado && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between">
            <span>{mensajeEstado}</span>
            <button
              type="button"
              onClick={() => setMensajeEstado('')}
              className="text-emerald-700 font-bold ml-4"
            >
              &times;
            </button>
          </div>
        )}

        {/* Tarjetas resumen */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <p className="text-xs text-slate-500">Lotes Activos</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{lotes.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <p className="text-xs text-slate-500">Controles Registrados</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{seguimientos.length}</p>
          </div>
          {esAdmin && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <p className="text-xs text-slate-500">Gastos Registrados</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                ${gastos.reduce((acc, g) => acc + Number(g.monto || 0), 0).toLocaleString()}
              </p>
            </div>
          )}
        </section>

        {/* Formularios operativos */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Control diario (todos los roles) */}
          <form
            onSubmit={handleRegistrarSeguimiento}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3"
          >
            <h2 className="text-base font-bold text-slate-800">Registro Diario de Campo</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Lote</label>
                <select
                  value={nuevoSeg.lote_id}
                  onChange={(e) => setNuevoSeg({ ...nuevoSeg, lote_id: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar lote...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} - {l.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tipo de Control
                </label>
                <select
                  value={nuevoSeg.tipo_registro}
                  onChange={(e) => setNuevoSeg({ ...nuevoSeg, tipo_registro: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="LECHE_LITROS">Leche (Litros)</option>
                  <option value="PESO_KG">Peso Promedio (Kg)</option>
                  <option value="HUEVOS">Producción de Huevos</option>
                  <option value="SANIDAD">Sanidad / Aplicación</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Valor</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={nuevoSeg.valor_principal}
                  onChange={(e) => setNuevoSeg({ ...nuevoSeg, valor_principal: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Alimento (kg)
                </label>
                <input
                  type="number"
                  step="any"
                  value={nuevoSeg.alimento_kg}
                  onChange={(e) => setNuevoSeg({ ...nuevoSeg, alimento_kg: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mortalidad</label>
                <input
                  type="number"
                  min="0"
                  value={nuevoSeg.mortalidad}
                  onChange={(e) => setNuevoSeg({ ...nuevoSeg, mortalidad: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones</label>
              <input
                type="text"
                value={nuevoSeg.observaciones}
                onChange={(e) => setNuevoSeg({ ...nuevoSeg, observaciones: e.target.value })}
                placeholder="Novedades del potrero, galpón o corral"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm"
            >
              Guardar Seguimiento
            </button>
          </form>

          {/* Solo ADMIN: Crear Lote o Registrar Gasto */}
          {esAdmin ? (
            <div className="space-y-4">
              <form
                onSubmit={handleCrearLote}
                className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3"
              >
                <h2 className="text-base font-bold text-slate-800">Nuevo Lote Pecuario</h2>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Código (ej. LOT-01)"
                    value={nuevoLote.codigo}
                    onChange={(e) => setNuevoLote({ ...nuevoLote, codigo: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Nombre del lote"
                    value={nuevoLote.nombre}
                    onChange={(e) => setNuevoLote({ ...nuevoLote, nombre: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <select
                    value={nuevoLote.especie}
                    onChange={(e) => setNuevoLote({ ...nuevoLote, especie: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="Bovinos">Bovinos</option>
                    <option value="Porcinos">Porcinos</option>
                    <option value="Avicultura">Avicultura</option>
                    <option value="Ovinos/Caprinos">Ovinos/Caprinos</option>
                  </select>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Cantidad"
                    value={nuevoLote.cantidad_inicial}
                    onChange={(e) =>
                      setNuevoLote({ ...nuevoLote, cantidad_inicial: e.target.value })
                    }
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Costo compra ($)"
                    value={nuevoLote.costo_compra_total}
                    onChange={(e) =>
                      setNuevoLote({ ...nuevoLote, costo_compra_total: e.target.value })
                    }
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 rounded-lg text-sm"
                >
                  Crear Lote
                </button>
              </form>

              <form
                onSubmit={handleRegistrarGasto}
                className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3"
              >
                <h2 className="text-base font-bold text-slate-800">Registrar Gasto y Factura</h2>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={nuevoGasto.categoria}
                    onChange={(e) => setNuevoGasto({ ...nuevoGasto, categoria: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="ALIMENTO">Alimento</option>
                    <option value="MEDICAMENTOS">Medicamentos / Veterinaria</option>
                    <option value="MANO_DE_OBRA">Mano de Obra</option>
                    <option value="INSUMOS">Insumos / Mantenimiento</option>
                  </select>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Monto ($)"
                    value={nuevoGasto.monto}
                    onChange={(e) => setNuevoGasto({ ...nuevoGasto, monto: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Descripción del gasto"
                  value={nuevoGasto.descripcion}
                  onChange={(e) => setNuevoGasto({ ...nuevoGasto, descripcion: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) =>
                    setNuevoGasto({ ...nuevoGasto, archivo: e.target.files?.[0] || null })
                  }
                  className="w-full text-xs text-slate-600"
                />
                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm"
                >
                  Guardar Gasto
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-center">
              <h2 className="text-base font-bold text-slate-800 mb-1">Panel Operativo</h2>
              <p className="text-sm text-slate-600">
                Tu cuenta tiene rol <span className="font-semibold">{usuario.rol}</span>. Puedes
                registrar controles diarios incluso sin conexión a internet y sincronizarlos cuando
                vuelva la red.
              </p>
            </div>
          )}
        </section>

        {/* Listado de lotes */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <h2 className="text-base font-bold text-slate-800 mb-3">Lotes Registrados</h2>
          {lotes.length === 0 ? (
            <p className="text-sm text-slate-500">No hay lotes registrados aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Código</th>
                    <th className="py-2 pr-4">Nombre</th>
                    <th className="py-2 pr-4">Especie</th>
                    <th className="py-2 pr-4">Cantidad</th>
                    <th className="py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lotes.map((lote) => (
                    <tr key={lote.id}>
                      <td className="py-2.5 pr-4 font-medium">{lote.codigo}</td>
                      <td className="py-2.5 pr-4">{lote.nombre}</td>
                      <td className="py-2.5 pr-4">{lote.especie}</td>
                      <td className="py-2.5 pr-4">{lote.cantidad_actual ?? lote.cantidad_inicial}</td>
                      <td className="py-2.5">{lote.estado || 'ACTIVO'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {mostrarModalTrabajador && esAdmin && (
        <CrearTrabajadorModal
          onClose={() => setMostrarModalTrabajador(false)}
          onCreado={(trabajador) =>
            setMensajeEstado(`Trabajador ${trabajador.nombre} (${trabajador.rol}) creado.`)
          }
        />
      )}
    </div>
  );
}
