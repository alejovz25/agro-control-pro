import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import db from './utils/offlineDb';
import { exportarReporteContableExcel } from './utils/exportExcel';
import LoginView from './components/LoginView';
import CrearTrabajadorModal from './components/CrearTrabajadorModal';

const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_URL = RAW_API_URL.replace(/\/+$/, '');

function leerSeguro(clave) {
  try {
    return localStorage.getItem(clave) || '';
  } catch {
    return '';
  }
}

function guardarSeguro(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Ignora restricciones del navegador
  }
}

function borrarSeguro(clave) {
  try {
    localStorage.removeItem(clave);
  } catch {
    // Ignora restricciones del navegador
  }
}

function GraficaLote({ registros = [] }) {
  const puntos = useMemo(() => {
    const ordenados = [...registros]
      .filter((r) => r.tipo_registro !== 'SANIDAD')
      .sort((a, b) => String(a.fecha_registro || '').localeCompare(String(b.fecha_registro || '')))
      .slice(-10);
    return ordenados.map((r, idx) => ({
      idx,
      label: String(r.fecha_registro || '').slice(5) || `#${idx + 1}`,
      valor: Number(r.valor_principal || 0),
      alimento: Number(r.alimento_kg || 0)
    }));
  }, [registros]);

  if (puntos.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-6 text-center">
        Aún no hay registros numéricos para graficar en este lote.
      </p>
    );
  }

  const maxVal = Math.max(...puntos.map((p) => Math.max(p.valor, p.alimento)), 1);
  const width = 440;
  const height = 160;
  const padX = 32;
  const padY = 20;

  const coords = puntos.map((p, i) => {
    const x =
      puntos.length === 1
        ? width / 2
        : padX + (i / (puntos.length - 1)) * (width - padX * 2);
    const y = height - padY - (p.valor / maxVal) * (height - padY * 2);
    return { ...p, x, y };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
      <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
        <span className="font-semibold text-slate-800">Evolución de Control (Valor Diario)</span>
        <span>Máx: {maxVal}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible">
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="#cbd5e1"
          strokeWidth="1"
        />
        <polyline fill="none" stroke="#047857" strokeWidth="2.5" points={polylinePoints} />
        {coords.map((c) => (
          <g key={c.idx}>
            <circle cx={c.x} cy={c.y} r="4" fill="#047857" />
            <text x={c.x} y={height - 4} textAnchor="middle" fontSize="10" fill="#475569">
              {c.label}
            </text>
            <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="10" fill="#065f46">
              {c.valor}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => leerSeguro('agro_token'));
  const [usuario, setUsuario] = useState(() => {
    try {
      const saved = leerSeguro('agro_usuario');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  });

  const [online, setOnline] = useState(() => navigator.onLine);
  const [vistaActiva, setVistaActiva] = useState('operacion');
  const [loteSeleccionadoId, setLoteSeleccionadoId] = useState(null);
  const [mostrarModalTrabajador, setMostrarModalTrabajador] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState('');

  const [lotes, setLotes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [seguimientos, setSeguimientos] = useState([]);

  const rolUsuario = String(usuario?.rol || 'OPERARIO').toUpperCase();
  const esAdmin = rolUsuario === 'ADMIN';
  const esTecnico = rolUsuario === 'TECNICO';

  const [nuevoLote, setNuevoLote] = useState({
    codigo: '',
    nombre: '',
    especie: 'Bovinos Cárnicos',
    cantidad_inicial: '',
    peso_inicial_animal_kg: '',
    costo_compra_total: '',
    fecha_inicio: new Date().toISOString().slice(0, 10)
  });

  const [nuevoSeg, setNuevoSeg] = useState({
    lote_id: '',
    tipo_registro: esTecnico ? 'SANIDAD' : 'PESO_KG',
    valor_principal: '',
    alimento_kg: '',
    ingresos_animales: '0',
    mortalidad: '0',
    observaciones: '',
    fecha_registro: new Date().toISOString().slice(0, 10)
  });

  useEffect(() => {
    setNuevoSeg((prev) => ({
      ...prev,
      tipo_registro: esTecnico
        ? 'SANIDAD'
        : prev.tipo_registro === 'SANIDAD' && !esAdmin
          ? 'PESO_KG'
          : prev.tipo_registro
    }));
  }, [esTecnico, esAdmin]);

  const [nuevoMov, setNuevoMov] = useState({
    lote_id: '',
    tipo: 'VENTA',
    categoria: 'VENTA_ANIMAL',
    descripcion: '',
    cantidad_animales: '1',
    peso_final_kg: '',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    archivo: null
  });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const cerrarSesion = useCallback(() => {
    borrarSeguro('agro_token');
    borrarSeguro('agro_usuario');
    setToken('');
    setUsuario(null);
    setLotes([]);
    setMovimientos([]);
    setSeguimientos([]);
    setLoteSeleccionadoId(null);
    setMensajeEstado('');
  }, []);

  const cargarDatosLocales = useCallback(async () => {
    try {
      const [lotesLocal, movLocal, segLocal] = await Promise.all([
        db.lotes ? db.lotes.toArray() : [],
        db.gastos ? db.gastos.toArray() : [],
        db.seguimientos ? db.seguimientos.toArray() : []
      ]);
      setLotes(Array.isArray(lotesLocal) ? lotesLocal : []);
      setMovimientos(Array.isArray(movLocal) ? movLocal : []);
      setSeguimientos(Array.isArray(segLocal) ? segLocal : []);
    } catch {
      // Evita bloquear la vista si IndexedDB no está disponible
    }
  }, []);

  const cargarDatosServidor = useCallback(async () => {
    if (!token || !navigator.onLine) return;
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [resLotes, resSeg] = await Promise.all([
        fetch(`${API_URL}/api/lotes`, { headers }),
        fetch(`${API_URL}/api/lotes/seguimientos`, { headers })
      ]);

      if (resLotes.ok) {
        const dataLotes = await resLotes.json().catch(() => []);
        if (Array.isArray(dataLotes)) {
          setLotes(dataLotes);
          if (db.lotes) {
            await db.lotes.clear();
            await db.lotes.bulkPut(dataLotes);
          }
        }
      }

      if (resSeg.ok) {
        const dataSeg = await resSeg.json().catch(() => []);
        if (Array.isArray(dataSeg)) {
          setSeguimientos((prev) => {
            const localesPendientes = prev.filter((p) => p.pendiente_sync);
            const idsServidor = new Set(dataSeg.map((d) => d.id));
            const combinados = [
              ...localesPendientes.filter((p) => !idsServidor.has(p.id)),
              ...dataSeg
            ];
            if (db.seguimientos) {
              db.seguimientos.clear().then(() => db.seguimientos.bulkPut(combinados));
            }
            return combinados;
          });
        }
      }

      const rolActual = String(usuario?.rol || '').toUpperCase();
      if (rolActual === 'ADMIN' || rolActual === 'TECNICO') {
        const resMov = await fetch(`${API_URL}/api/finanzas/movimientos`, { headers });
        if (resMov.ok) {
          const dataMov = await resMov.json().catch(() => []);
          if (Array.isArray(dataMov)) {
            setMovimientos((prev) => {
              const localesPendientes = prev.filter((p) => p.pendiente_sync);
              const idsServidor = new Set(dataMov.map((d) => d.id));
              const combinados = [
                ...localesPendientes.filter((p) => !idsServidor.has(p.id)),
                ...dataMov
              ];
              if (db.gastos) {
                db.gastos.clear().then(() => db.gastos.bulkPut(combinados));
              }
              return combinados;
            });
          }
        }
      }
    } catch {
      setMensajeEstado('Sin conexión con el servidor; mostrando datos locales.');
    }
  }, [token, usuario?.rol]);

  useEffect(() => {
    if (!usuario) return;
    cargarDatosLocales();
    cargarDatosServidor();
  }, [usuario, cargarDatosLocales, cargarDatosServidor]);

  const handleLoginSuccess = (data) => {
    const u = data?.usuario || data?.user || null;
    if (!u) return;

    const usuarioSeguro = {
      id: u.id || '',
      empresa_id: u.empresa_id || u.empresaId || '',
      nombre: u.nombre || u.name || u.email || 'Usuario',
      email: u.email || '',
      rol: String(u.rol || u.role || 'ADMIN').toUpperCase()
    };

    const nuevoToken = data?.token || data?.accessToken || data?.jwt || '';
    if (nuevoToken) {
      guardarSeguro('agro_token', nuevoToken);
      setToken(nuevoToken);
    }
    guardarSeguro('agro_usuario', JSON.stringify(usuarioSeguro));
    setUsuario(usuarioSeguro);
    setMensajeEstado(`Bienvenido, ${usuarioSeguro.nombre} (${usuarioSeguro.rol})`);
  };

  const handleCrearLote = async (e) => {
    e.preventDefault();
    if (!esAdmin) return;

    const cantIni = Math.max(0, Number(nuevoLote.cantidad_inicial || 0));
    const pesoIniAnimal = Number(nuevoLote.peso_inicial_animal_kg || 0);
    const costoCompra = Number(nuevoLote.costo_compra_total || 0);
    const fechaInicio = nuevoLote.fecha_inicio;

    const lotePayload = {
      id: uuidv4(),
      codigo: nuevoLote.codigo.trim(),
      nombre: nuevoLote.nombre.trim(),
      especie: nuevoLote.especie,
      cantidad_inicial: cantIni,
      cantidad_actual: cantIni,
      peso_inicial_animal_kg: pesoIniAnimal,
      peso_final_kg: 0,
      costo_compra_total: costoCompra,
      valor_venta_total: 0,
      fecha_inicio: fechaInicio,
      estado: 'ACTIVO',
      pendiente_sync: !online
    };

    const movCompra =
      costoCompra > 0
        ? {
            id: uuidv4(),
            lote_id: lotePayload.id,
            lote_codigo: lotePayload.codigo,
            lote_nombre: lotePayload.nombre,
            tipo: 'COMPRA',
            categoria: 'COMPRA_LOTE',
            descripcion: `Compra lote ${lotePayload.codigo} - ${lotePayload.nombre}`,
            cantidad_animales: cantIni,
            peso_final_kg: 0,
            monto: costoCompra,
            fecha: fechaInicio,
            pendiente_sync: !online
          }
        : null;

    try {
      if (online && token) {
        const res = await fetch(`${API_URL}/api/lotes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(lotePayload)
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'No se pudo crear el lote');
        }
        const creado = await res.json().catch(() => ({}));
        const loteFinal = { ...(creado?.id ? creado : lotePayload), pendiente_sync: false };
        setLotes((prev) => [loteFinal, ...prev]);
        if (db.lotes) await db.lotes.put(loteFinal);
        await cargarDatosServidor();
      } else {
        setLotes((prev) => [lotePayload, ...prev]);
        if (db.lotes) await db.lotes.put(lotePayload);
        if (movCompra) {
          setMovimientos((prev) => [movCompra, ...prev]);
          if (db.gastos) await db.gastos.put(movCompra);
        }
      }

      setNuevoLote({
        codigo: '',
        nombre: '',
        especie: 'Bovinos Cárnicos',
        cantidad_inicial: '',
        peso_inicial_animal_kg: '',
        costo_compra_total: '',
        fecha_inicio: new Date().toISOString().slice(0, 10)
      });
      setMensajeEstado('Lote creado con su peso inicial por animal y compra registrada.');
    } catch (err) {
      setMensajeEstado(err.message);
    }
  };

  const handleRegistrarSeguimiento = async (e, loteForzadoId = null) => {
    e.preventDefault();
    const targetLoteId = loteForzadoId || nuevoSeg.lote_id || lotes[0]?.id || '';
    if (!targetLoteId) {
      setMensajeEstado('Selecciona o crea un lote antes de registrar.');
      return;
    }

    const loteObj = lotes.find((l) => l.id === targetLoteId);
    const tipoFinal = esTecnico ? 'SANIDAD' : nuevoSeg.tipo_registro;
    const esSanidad = tipoFinal === 'SANIDAD';
    const mort = esSanidad ? 0 : Math.max(0, Number(nuevoSeg.mortalidad || 0));
    const ing = esSanidad ? 0 : Math.max(0, Number(nuevoSeg.ingresos_animales || 0));
    const val = esSanidad ? 0 : Number(nuevoSeg.valor_principal || 0);
    const alim = esSanidad ? 0 : Number(nuevoSeg.alimento_kg || 0);
    const cantActualPrevia = Number(loteObj?.cantidad_actual ?? loteObj?.cantidad_inicial ?? 0);
    const cantActualNueva = Math.max(0, cantActualPrevia + ing - mort);

    const registro = {
      id: uuidv4(),
      lote_id: targetLoteId,
      lote_codigo: loteObj?.codigo || '',
      lote_nombre: loteObj?.nombre || '',
      autor_nombre: usuario?.nombre || usuario?.email || 'Usuario',
      tipo_registro: tipoFinal,
      valor_principal: val,
      alimento_kg: alim,
      ingresos_animales: ing,
      mortalidad: mort,
      observaciones: nuevoSeg.observaciones.trim(),
      fecha_registro: nuevoSeg.fecha_registro,
      pendiente_sync: true
    };

    try {
      if (online && token) {
        const res = await fetch(`${API_URL}/api/lotes/seguimientos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(registro)
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al guardar registro');
        }
        const dataRes = await res.json().catch(() => ({}));
        const segGuardado = {
          ...(dataRes.seguimiento || registro),
          lote_codigo: loteObj?.codigo || registro.lote_codigo,
          lote_nombre: loteObj?.nombre || registro.lote_nombre,
          pendiente_sync: false
        };
        setSeguimientos((prev) => [segGuardado, ...prev]);
        if (db.seguimientos) await db.seguimientos.put(segGuardado);

        setLotes((prev) =>
          prev.map((l) =>
            l.id === targetLoteId
              ? {
                  ...l,
                  cantidad_actual:
                    dataRes.cantidad_actual !== undefined ? dataRes.cantidad_actual : cantActualNueva,
                  peso_final_kg:
                    dataRes.peso_final_kg !== undefined ? dataRes.peso_final_kg : l.peso_final_kg
                }
              : l
          )
        );

        setNuevoSeg((prev) => ({
          ...prev,
          valor_principal: '',
          alimento_kg: '',
          ingresos_animales: '0',
          mortalidad: '0',
          observaciones: ''
        }));
        setMensajeEstado(
          esSanidad
            ? 'Aplicación de sanidad / medicamento registrada.'
            : 'Registro diario guardado y cantidad del lote actualizada.'
        );
        return;
      }

      setSeguimientos((prev) => [registro, ...prev]);
      if (db.seguimientos) await db.seguimientos.put(registro);

      setLotes((prev) =>
        prev.map((l) =>
          l.id === targetLoteId
            ? {
                ...l,
                cantidad_actual: cantActualNueva,
                peso_final_kg:
                  registro.tipo_registro === 'PESO_KG' && val > 0 ? val : l.peso_final_kg
              }
            : l
        )
      );

      setNuevoSeg((prev) => ({
        ...prev,
        valor_principal: '',
        alimento_kg: '',
        ingresos_animales: '0',
        mortalidad: '0',
        observaciones: ''
      }));
      setMensajeEstado('Registro guardado localmente (pendiente de sincronizar).');
    } catch (err) {
      setMensajeEstado(err.message || 'Error al guardar registro');
    }
  };

  const handleRegistrarMovimiento = async (e) => {
    e.preventDefault();
    if (!esAdmin) return;

    const loteObj = lotes.find((l) => l.id === nuevoMov.lote_id);
    const montoNum = Number(nuevoMov.monto || 0);
    const cantAnimales = Math.max(0, Number(nuevoMov.cantidad_animales || 0));
    const pesoFinal = Number(nuevoMov.peso_final_kg || 0);
    const tipoNorm = String(nuevoMov.tipo || 'GASTO').toUpperCase();
    const movId = uuidv4();

    try {
      if (online && token) {
        const formData = new FormData();
        formData.append('id', movId);
        formData.append('lote_id', nuevoMov.lote_id);
        formData.append('tipo', tipoNorm);
        formData.append('categoria', nuevoMov.categoria);
        formData.append('descripcion', nuevoMov.descripcion.trim());
        formData.append('cantidad_animales', String(cantAnimales));
        formData.append('peso_final_kg', String(pesoFinal));
        formData.append('monto', String(montoNum));
        formData.append('fecha', nuevoMov.fecha);
        if (nuevoMov.archivo) {
          formData.append('factura', nuevoMov.archivo);
        }

        const res = await fetch(`${API_URL}/api/finanzas/gastos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al registrar movimiento financiero');
        }
        await cargarDatosServidor();
      } else {
        const movOffline = {
          id: movId,
          lote_id: nuevoMov.lote_id || null,
          lote_codigo: loteObj?.codigo || '',
          lote_nombre: loteObj?.nombre || '',
          tipo: tipoNorm,
          categoria: nuevoMov.categoria,
          descripcion: nuevoMov.descripcion.trim(),
          cantidad_animales: cantAnimales,
          peso_final_kg: pesoFinal,
          monto: montoNum,
          fecha: nuevoMov.fecha,
          nombre_archivo: nuevoMov.archivo ? nuevoMov.archivo.name : null,
          pendiente_sync: true
        };
        setMovimientos((prev) => [movOffline, ...prev]);
        if (db.gastos) await db.gastos.put(movOffline);
      }

      setNuevoMov({
        lote_id: '',
        tipo: 'VENTA',
        categoria: 'VENTA_ANIMAL',
        descripcion: '',
        cantidad_animales: '1',
        peso_final_kg: '',
        monto: '',
        fecha: new Date().toISOString().slice(0, 10),
        archivo: null
      });
      setMensajeEstado('Movimiento financiero guardado.');
    } catch (err) {
      setMensajeEstado(err.message);
    }
  };

  const handleSincronizarTodo = async () => {
    if (!online || !token) {
      setMensajeEstado('Necesitas conexión a internet y sesión válida para sincronizar.');
      return;
    }

    setSincronizando(true);
    try {
      const pendientesLotes = lotes.filter((l) => l.pendiente_sync);
      const pendientesSeg = seguimientos.filter((s) => s.pendiente_sync);
      const pendientesMov = movimientos.filter((m) => m.pendiente_sync);

      if (pendientesLotes.length > 0 || pendientesSeg.length > 0) {
        const resSeg = await fetch(`${API_URL}/api/lotes/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ lotes: pendientesLotes, seguimientos: pendientesSeg })
        });
        if (!resSeg.ok) {
          const errData = await resSeg.json().catch(() => ({}));
          throw new Error(errData.error || 'Error sincronizando lotes y seguimientos');
        }
      }

      if (esAdmin && pendientesMov.length > 0) {
        const resMov = await fetch(`${API_URL}/api/finanzas/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ movimientos: pendientesMov })
        });
        if (!resMov.ok) {
          const errData = await resMov.json().catch(() => ({}));
          throw new Error(errData.error || 'Error sincronizando movimientos financieros');
        }
      }

      await cargarDatosServidor();
      setMensajeEstado('Sincronización completada con el servidor.');
    } catch (err) {
      setMensajeEstado(err.message);
    } finally {
      setSincronizando(false);
    }
  };

  if (!usuario) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const nombreUsuario = usuario?.nombre || usuario?.email || 'Usuario';
  const esFormularioSanidad = esTecnico || nuevoSeg.tipo_registro === 'SANIDAD';

  const totalPendientes =
    lotes.filter((l) => l.pendiente_sync).length +
    seguimientos.filter((s) => s.pendiente_sync).length +
    movimientos.filter((m) => m.pendiente_sync).length;

  const totalIngresosVentas = movimientos
    .filter((m) => String(m.tipo || '').toUpperCase() === 'VENTA')
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const totalEgresos = movimientos
    .filter((m) => String(m.tipo || '').toUpperCase() !== 'VENTA')
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const balanceNeto = totalIngresosVentas - totalEgresos;
  const loteDetalle = lotes.find((l) => l.id === loteSeleccionadoId) || null;
  const seguimientosLoteDetalle = loteDetalle
    ? seguimientos.filter((s) => s.lote_id === loteDetalle.id)
    : [];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-emerald-900 text-white px-4 py-3 shadow">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">AgroControl Pro</h1>
            <p className="text-xs text-emerald-200">
              {nombreUsuario} &bull; Rol: <span className="font-semibold">{rolUsuario}</span>
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

            <button
              type="button"
              onClick={() => setVistaActiva('reportes')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              Reporte por Lotes
            </button>

            {esAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setMostrarModalTrabajador(true)}
                  className="px-3 py-1.5 rounded-lg bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-semibold"
                >
                  Equipo y Claves
                </button>

                <button
                  type="button"
                  onClick={() =>
                    exportarReporteContableExcel(
                      `Reporte_${String(usuario?.empresa_id || 'AgroControl').slice(0, 8)}`,
                      lotes,
                      movimientos,
                      seguimientos
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-semibold"
                >
                  Descargar Excel
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

      <nav className="bg-white border-b border-slate-200 px-4">
        <div className="max-w-6xl mx-auto flex gap-4 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setVistaActiva('operacion')}
            className={`py-3 border-b-2 ${
              vistaActiva === 'operacion'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {esTecnico ? 'Sanidad y Medicamentos' : 'Lotes y Control Diario'}
          </button>
          <button
            type="button"
            onClick={() => setVistaActiva('reportes')}
            className={`py-3 border-b-2 ${
              vistaActiva === 'reportes'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Reportes, Observaciones y Gráficas
          </button>
          {esAdmin && (
            <button
              type="button"
              onClick={() => setVistaActiva('finanzas')}
              className={`py-3 border-b-2 ${
                vistaActiva === 'finanzas'
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Movimientos Financieros
            </button>
          )}
        </div>
      </nav>

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

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <p className="text-xs text-slate-500">Lotes Activos</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{lotes.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <p className="text-xs text-slate-500">Animales Actuales</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {lotes.reduce(
                (acc, l) => acc + Number(l.cantidad_actual ?? l.cantidad_inicial ?? 0),
                0
              )}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <p className="text-xs text-slate-500">Controles / Notas</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{seguimientos.length}</p>
          </div>
          {esAdmin && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <p className="text-xs text-slate-500">Balance Financiero</p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  balanceNeto >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                ${balanceNeto.toLocaleString()}
              </p>
            </div>
          )}
        </section>

        {vistaActiva === 'operacion' && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Formulario de Registro: SANIDAD sin valor numérico */}
              <form
                onSubmit={(e) => handleRegistrarSeguimiento(e, null)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3"
              >
                <h2 className="text-base font-bold text-slate-800">
                  {esTecnico
                    ? 'Registro de Sanidad y Aplicación de Medicamento'
                    : 'Registro Diario de Campo'}
                </h2>

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
                          {l.codigo} - {l.nombre} ({l.cantidad_actual ?? l.cantidad_inicial} und)
                        </option>
                      ))}
                    </select>
                  </div>

                  {!esTecnico ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Tipo de Control
                      </label>
                      <select
                        value={nuevoSeg.tipo_registro}
                        onChange={(e) => setNuevoSeg({ ...nuevoSeg, tipo_registro: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="PESO_KG">Peso Promedio / Control (Kg)</option>
                        <option value="LECHE_LITROS">Leche (Litros)</option>
                        <option value="HUEVOS">Producción de Huevos</option>
                        {esAdmin && <option value="SANIDAD">Sanidad / Medicamento</option>}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Tipo de Registro
                      </label>
                      <input
                        type="text"
                        readOnly
                        value="SANIDAD / MEDICAMENTO"
                        className="w-full border border-slate-200 bg-slate-100 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-800"
                      />
                    </div>
                  )}
                </div>

                {esFormularioSanidad ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Medicamento / Tratamiento Aplicado y Observaciones
                    </label>
                    <input
                      type="text"
                      required
                      value={nuevoSeg.observaciones}
                      onChange={(e) =>
                        setNuevoSeg({ ...nuevoSeg, observaciones: e.target.value })
                      }
                      placeholder="Ej. Aplicación de Ivermectina / Vacuna aftosa al lote"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Valor (Kg/L/Und)
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={nuevoSeg.valor_principal}
                          onChange={(e) =>
                            setNuevoSeg({ ...nuevoSeg, valor_principal: e.target.value })
                          }
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
                          onChange={(e) =>
                            setNuevoSeg({ ...nuevoSeg, alimento_kg: e.target.value })
                          }
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          + Ingreso / Nac.
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={nuevoSeg.ingresos_animales}
                          onChange={(e) =>
                            setNuevoSeg({ ...nuevoSeg, ingresos_animales: e.target.value })
                          }
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          - Mortalidad
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={nuevoSeg.mortalidad}
                          onChange={(e) =>
                            setNuevoSeg({ ...nuevoSeg, mortalidad: e.target.value })
                          }
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Observaciones / Anotaciones
                      </label>
                      <input
                        type="text"
                        value={nuevoSeg.observaciones}
                        onChange={(e) =>
                          setNuevoSeg({ ...nuevoSeg, observaciones: e.target.value })
                        }
                        placeholder="Escribe novedades visibles para el administrador y equipo"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm"
                >
                  {esFormularioSanidad ? 'Guardar Sanidad / Medicamento' : 'Guardar Registro Diario'}
                </button>
              </form>

              {esAdmin ? (
                <form
                  onSubmit={handleCrearLote}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3"
                >
                  <h2 className="text-base font-bold text-slate-800">
                    Nuevo Lote (Peso Inicial por Animal y Compra)
                  </h2>
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

                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={nuevoLote.especie}
                      onChange={(e) => setNuevoLote({ ...nuevoLote, especie: e.target.value })}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="Bovinos Cárnicos">Bovinos Cárnicos</option>
                      <option value="Porcinos Cárnicos">Porcinos Cárnicos</option>
                      <option value="Avicultura Engorde">Avicultura Engorde</option>
                      <option value="Bovinos Leche">Bovinos Leche</option>
                      <option value="Ovinos/Caprinos">Ovinos/Caprinos</option>
                    </select>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="Cantidad de animales"
                      value={nuevoLote.cantidad_inicial}
                      onChange={(e) =>
                        setNuevoLote({ ...nuevoLote, cantidad_inicial: e.target.value })
                      }
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      step="any"
                      placeholder="Peso inicial por animal (kg)"
                      value={nuevoLote.peso_inicial_animal_kg}
                      onChange={(e) =>
                        setNuevoLote({ ...nuevoLote, peso_inicial_animal_kg: e.target.value })
                      }
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Valor de compra ($)"
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
              ) : (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-center">
                  <h2 className="text-base font-bold text-slate-800 mb-1">
                    {esTecnico ? 'Panel Técnico Veterinario' : 'Panel de Operario'}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {esTecnico
                      ? 'Como Técnico Veterinario puedes registrar la sanidad y aplicación de medicamentos por lote y consultar reportes y gráficas.'
                      : 'Como Operario puedes realizar el registro diario de campo (producción/peso, alimento, ingresos, mortalidad y observaciones).'}
                  </p>
                </div>
              )}
            </section>

            {/* Tabla de lotes */}
            <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-bold text-slate-800">
                  Lotes Registrados (clic en un lote para abrir su panel)
                </h2>
                <button
                  type="button"
                  onClick={() => setVistaActiva('reportes')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                >
                  Ver Reporte por Lotes
                </button>
              </div>

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
                        <th className="py-2 pr-4">Animales</th>
                        <th className="py-2 pr-4">Peso Ini/Animal / Final</th>
                        <th className="py-2 pr-4">Compra / Venta</th>
                        <th className="py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lotes.map((lote) => (
                        <tr
                          key={lote.id}
                          onClick={() => setLoteSeleccionadoId(lote.id)}
                          className="hover:bg-emerald-50/60 cursor-pointer transition"
                        >
                          <td className="py-2.5 pr-4 font-semibold text-emerald-900">
                            {lote.codigo}
                          </td>
                          <td className="py-2.5 pr-4">{lote.nombre}</td>
                          <td className="py-2.5 pr-4">{lote.especie}</td>
                          <td className="py-2.5 pr-4 font-medium">
                            {lote.cantidad_actual ?? lote.cantidad_inicial} /{' '}
                            {lote.cantidad_inicial}
                          </td>
                          <td className="py-2.5 pr-4">
                            {Number(lote.peso_inicial_animal_kg || 0)} kg /{' '}
                            {Number(lote.peso_final_kg || 0)} kg
                          </td>
                          <td className="py-2.5 pr-4">
                            ${Number(lote.costo_compra_total || 0).toLocaleString()} / $
                            {Number(lote.valor_venta_total || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLoteSeleccionadoId(lote.id);
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-700 text-white text-xs font-semibold"
                            >
                              Abrir Lote
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {vistaActiva === 'reportes' && (
          <section className="space-y-6">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  Reporte por Lotes (Población, Peso Inicial/Final y Rentabilidad)
                </h2>
                {esAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      exportarReporteContableExcel(
                        `Reporte_Lotes_${String(usuario?.empresa_id || 'AgroControl').slice(0, 8)}`,
                        lotes,
                        movimientos,
                        seguimientos
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-semibold"
                  >
                    Exportar Reporte Excel
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lotes.map((l) => {
                  const segs = seguimientos.filter((s) => s.lote_id === l.id);
                  const mortTotal = segs.reduce((a, s) => a + Number(s.mortalidad || 0), 0);
                  const ingTotal = segs.reduce((a, s) => a + Number(s.ingresos_animales || 0), 0);
                  const alimTotal = segs.reduce((a, s) => a + Number(s.alimento_kg || 0), 0);
                  const pesoIniAnimal = Number(l.peso_inicial_animal_kg || 0);
                  const pesoFin = Number(l.peso_final_kg || 0);
                  const margen =
                    Number(l.valor_venta_total || 0) - Number(l.costo_compra_total || 0);

                  return (
                    <div
                      key={l.id}
                      className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50/50"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900">
                          {l.codigo} — {l.nombre}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setLoteSeleccionadoId(l.id)}
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          Ver gráfica y registro
                        </button>
                      </div>
                      <p className="text-xs text-slate-600">
                        Animales actuales: <strong>{l.cantidad_actual ?? l.cantidad_inicial}</strong>{' '}
                        (+{ingTotal} ingresos / -{mortTotal} mortalidad) &bull; Alimento:{' '}
                        <strong>{alimTotal} kg</strong>
                      </p>
                      <p className="text-xs text-slate-600">
                        Peso inicial/animal: <strong>{pesoIniAnimal} kg</strong> &bull; Peso final:{' '}
                        <strong>{pesoFin} kg</strong>
                      </p>
                      <p className="text-xs text-slate-600">
                        Compra: <strong>${Number(l.costo_compra_total || 0).toLocaleString()}</strong>{' '}
                        &bull; Venta:{' '}
                        <strong>${Number(l.valor_venta_total || 0).toLocaleString()}</strong> &bull;
                        Margen: <strong>${margen.toLocaleString()}</strong>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
              <h2 className="text-base font-bold text-slate-800">
                Anotaciones, Sanidad y Observaciones del Equipo
              </h2>
              {seguimientos.length === 0 ? (
                <p className="text-sm text-slate-500">No hay observaciones registradas.</p>
              ) : (
                <div className="divide-y">
                  {seguimientos.map((s) => (
                    <div key={s.id} className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {s.observaciones || '(Sin anotación escrita)'}
                        </p>
                        <p className="text-xs text-slate-500">
                          Lote: <strong>{s.lote_codigo || s.lote_id}</strong> &bull;{' '}
                          <strong>{s.tipo_registro}</strong>
                          {s.tipo_registro !== 'SANIDAD' && (
                            <>
                              : <strong>{s.valor_principal}</strong> &bull; Alimento:{' '}
                              <strong>{s.alimento_kg} kg</strong> &bull; +{s.ingresos_animales || 0}{' '}
                              / -{s.mortalidad || 0}
                            </>
                          )}{' '}
                          &bull; Por: {s.autor_nombre || 'Equipo'}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">{s.fecha_registro}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {vistaActiva === 'finanzas' && esAdmin && (
          <section className="space-y-6">
            <form
              onSubmit={handleRegistrarMovimiento}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3"
            >
              <h2 className="text-base font-bold text-slate-800">
                Registrar Venta, Compra o Gasto
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={nuevoMov.tipo}
                  onChange={(e) => {
                    const t = e.target.value;
                    setNuevoMov({
                      ...nuevoMov,
                      tipo: t,
                      categoria:
                        t === 'VENTA'
                          ? 'VENTA_ANIMAL'
                          : t === 'COMPRA'
                            ? 'COMPRA_LOTE'
                            : 'ALIMENTO'
                    });
                  }}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="VENTA">VENTA (Descuenta animales del lote)</option>
                  <option value="COMPRA">COMPRA</option>
                  <option value="GASTO">GASTO</option>
                </select>

                <select
                  value={nuevoMov.lote_id}
                  onChange={(e) => setNuevoMov({ ...nuevoMov, lote_id: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar lote...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} - {l.nombre} ({l.cantidad_actual ?? l.cantidad_inicial} und)
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  required
                  placeholder="Categoría (ej. VENTA_ANIMAL, ALIMENTO)"
                  value={nuevoMov.categoria}
                  onChange={(e) => setNuevoMov({ ...nuevoMov, categoria: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="number"
                  min="0"
                  placeholder="Cantidad de animales (ej. 1)"
                  value={nuevoMov.cantidad_animales}
                  onChange={(e) =>
                    setNuevoMov({ ...nuevoMov, cantidad_animales: e.target.value })
                  }
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Peso final (kg)"
                  value={nuevoMov.peso_final_kg}
                  onChange={(e) => setNuevoMov({ ...nuevoMov, peso_final_kg: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="Valor / Monto ($)"
                  value={nuevoMov.monto}
                  onChange={(e) => setNuevoMov({ ...nuevoMov, monto: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Descripción del movimiento"
                  value={nuevoMov.descripcion}
                  onChange={(e) => setNuevoMov({ ...nuevoMov, descripcion: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) =>
                    setNuevoMov({ ...nuevoMov, archivo: e.target.files?.[0] || null })
                  }
                  className="text-xs text-slate-600 self-center"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-sm"
              >
                Guardar Movimiento Financiero
              </button>
            </form>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  Historial de Movimientos Financieros
                </h2>
                <div className="text-xs space-x-3">
                  <span className="text-emerald-700 font-semibold">
                    Ventas: ${totalIngresosVentas.toLocaleString()}
                  </span>
                  <span className="text-red-600 font-semibold">
                    Compras/Gastos: ${totalEgresos.toLocaleString()}
                  </span>
                </div>
              </div>

              {movimientos.length === 0 ? (
                <p className="text-sm text-slate-500">No hay movimientos financieros aún.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="border-b text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Fecha</th>
                        <th className="py-2 pr-4">Tipo</th>
                        <th className="py-2 pr-4">Descripción</th>
                        <th className="py-2 pr-4">Lote / Und</th>
                        <th className="py-2 pr-4">Peso Final</th>
                        <th className="py-2">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {movimientos.map((m) => {
                        const esVenta = String(m.tipo || '').toUpperCase() === 'VENTA';
                        return (
                          <tr key={m.id}>
                            <td className="py-2.5 pr-4">{m.fecha}</td>
                            <td className="py-2.5 pr-4 font-semibold">{m.tipo || 'GASTO'}</td>
                            <td className="py-2.5 pr-4">{m.descripcion}</td>
                            <td className="py-2.5 pr-4">
                              {m.lote_codigo || '-'}
                              {Number(m.cantidad_animales || 0) > 0
                                ? ` (${m.cantidad_animales} und)`
                                : ''}
                            </td>
                            <td className="py-2.5 pr-4">
                              {Number(m.peso_final_kg || 0) > 0 ? `${m.peso_final_kg} kg` : '-'}
                            </td>
                            <td
                              className={`py-2.5 font-semibold ${
                                esVenta ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {esVenta ? '+' : '-'}${Number(m.monto || 0).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {loteDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 my-8">
            <div className="flex items-start justify-between gap-4 border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {loteDetalle.codigo} — {loteDetalle.nombre}
                </h2>
                <p className="text-xs text-slate-500">
                  {loteDetalle.especie} &bull; Animales actuales:{' '}
                  <strong>{loteDetalle.cantidad_actual ?? loteDetalle.cantidad_inicial}</strong>{' '}
                  &bull; Peso inicial/animal:{' '}
                  <strong>{Number(loteDetalle.peso_inicial_animal_kg || 0)} kg</strong> &bull; Peso
                  final: <strong>{Number(loteDetalle.peso_final_kg || 0)} kg</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoteSeleccionadoId(null)}
                className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <GraficaLote registros={seguimientosLoteDetalle} />

            <form
              onSubmit={(e) => handleRegistrarSeguimiento(e, loteDetalle.id)}
              className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-800">
                {esFormularioSanidad
                  ? 'Registrar Sanidad / Medicamento en este Lote'
                  : 'Nuevo Registro Diario en este Lote'}
              </h3>
              {esFormularioSanidad ? (
                <div className="space-y-2">
                  {!esTecnico && (
                    <select
                      value={nuevoSeg.tipo_registro}
                      onChange={(e) => setNuevoSeg({ ...nuevoSeg, tipo_registro: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    >
                      <option value="PESO_KG">Peso (Kg)</option>
                      <option value="LECHE_LITROS">Leche (L)</option>
                      <option value="HUEVOS">Huevos</option>
                      <option value="SANIDAD">Sanidad / Medicamento</option>
                    </select>
                  )}
                  <input
                    type="text"
                    required
                    placeholder="Medicamento aplicado y observaciones"
                    value={nuevoSeg.observaciones}
                    onChange={(e) =>
                      setNuevoSeg({ ...nuevoSeg, observaciones: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <select
                      value={nuevoSeg.tipo_registro}
                      onChange={(e) => setNuevoSeg({ ...nuevoSeg, tipo_registro: e.target.value })}
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    >
                      <option value="PESO_KG">Peso (Kg)</option>
                      <option value="LECHE_LITROS">Leche (L)</option>
                      <option value="HUEVOS">Huevos</option>
                      {esAdmin && <option value="SANIDAD">Sanidad / Medicamento</option>}
                    </select>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="Valor"
                      value={nuevoSeg.valor_principal}
                      onChange={(e) =>
                        setNuevoSeg({ ...nuevoSeg, valor_principal: e.target.value })
                      }
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="+ Ingreso"
                      value={nuevoSeg.ingresos_animales}
                      onChange={(e) =>
                        setNuevoSeg({ ...nuevoSeg, ingresos_animales: e.target.value })
                      }
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="- Mortalidad"
                      value={nuevoSeg.mortalidad}
                      onChange={(e) =>
                        setNuevoSeg({ ...nuevoSeg, mortalidad: e.target.value })
                      }
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Observaciones o novedades del lote"
                    value={nuevoSeg.observaciones}
                    onChange={(e) =>
                      setNuevoSeg({ ...nuevoSeg, observaciones: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                  />
                </>
              )}
              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 rounded-lg text-xs"
              >
                Guardar Registro en {loteDetalle.codigo}
              </button>
            </form>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              <h3 className="text-sm font-bold text-slate-800">
                Historial y Observaciones del Lote ({seguimientosLoteDetalle.length})
              </h3>
              {seguimientosLoteDetalle.length === 0 ? (
                <p className="text-xs text-slate-500">Sin registros en este lote.</p>
              ) : (
                seguimientosLoteDetalle.map((s) => (
                  <div
                    key={s.id}
                    className="p-2.5 rounded-lg border border-slate-200 text-xs flex justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">
                        {s.tipo_registro === 'SANIDAD' ? (
                          'SANIDAD / MEDICAMENTO'
                        ) : (
                          <>
                            {s.tipo_registro}: {s.valor_principal} &bull; +{s.ingresos_animales || 0}{' '}
                            / -{s.mortalidad || 0} &bull; Alim: {s.alimento_kg || 0} kg
                          </>
                        )}
                      </p>
                      {s.observaciones && (
                        <p className="text-slate-600 mt-0.5">{s.observaciones}</p>
                      )}
                      <p className="text-slate-400 mt-0.5">
                        Por: {s.autor_nombre || 'Equipo'} ({s.fecha_registro})
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {mostrarModalTrabajador && esAdmin && (
        <CrearTrabajadorModal
          onClose={() => setMostrarModalTrabajador(false)}
          onCreado={(trabajador) =>
            setMensajeEstado(
              `Trabajador ${trabajador?.nombre || 'registrado'} (${trabajador?.rol || 'OPERARIO'}) creado.`
            )
          }
        />
      )}
    </div>
  );
}
