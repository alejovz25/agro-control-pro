import React, { useState, useEffect, useCallback } from 'react';

const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_URL = RAW_API_URL.replace(/\/+$/, '');

export default function CrearTrabajadorModal({ onClose, onCreado }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('OPERARIO');

  const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);
  const [nuevasClaves, setNuevasClaves] = useState({});
  const [cargando, setCargando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargarUsuarios = useCallback(async () => {
    try {
      const token = localStorage.getItem('agro_token') || '';
      const res = await fetch(`${API_URL}/api/auth/usuarios`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json().catch(() => []);
        if (Array.isArray(data)) {
          setUsuariosEmpresa(data);
        }
      }
    } catch {
      // Ignora error de red al listar
    }
  }, []);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  const handleCrear = async (e) => {
    e.preventDefault();
    setError('');
    setMensaje('');
    setCargando(true);

    try {
      const token = localStorage.getItem('agro_token') || '';
      const res = await fetch(`${API_URL}/api/auth/usuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          password,
          rol
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo crear el trabajador');
      }

      const creado = data?.usuario || data || {};
      const nombreCreado = creado.nombre || nombre.trim();
      const rolCreado = creado.rol || rol;

      setMensaje(`Usuario ${nombreCreado} (${rolCreado}) creado correctamente.`);
      setNombre('');
      setEmail('');
      setPassword('');
      setRol('OPERARIO');
      await cargarUsuarios();
      if (onCreado) onCreado({ ...creado, nombre: nombreCreado, rol: rolCreado });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const handleCambiarPassword = async (usuarioId) => {
    const claveNueva = (nuevasClaves[usuarioId] || '').trim();
    if (claveNueva.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setError('');
    setMensaje('');
    setActualizandoId(usuarioId);

    try {
      const token = localStorage.getItem('agro_token') || '';
      const res = await fetch(`${API_URL}/api/auth/usuarios/${usuarioId}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ nuevaPassword: claveNueva })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar la contraseña');
      }

      setNuevasClaves((prev) => ({ ...prev, [usuarioId]: '' }));
      setMensaje(`Contraseña de ${data.nombre || 'usuario'} actualizada.`);
      await cargarUsuarios();
    } catch (err) {
      setError(err.message);
    } finally {
      setActualizandoId('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 space-y-5 my-8">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-bold text-slate-800">
            Equipo y Contraseñas (Administrador)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}
        {mensaje && (
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
            {mensaje}
          </div>
        )}

        <form onSubmit={handleCrear} className="space-y-3 bg-slate-50 p-4 rounded-xl border">
          <h3 className="text-sm font-bold text-slate-800">Registrar Nuevo Trabajador</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre</label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Andrés González"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Correo</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trabajador@empresa.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contraseña</label>
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Rol</label>
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="OPERARIO">OPERARIO (registro diario / campo)</option>
                <option value="TECNICO">TECNICO VETERINARIO (solo sanidad / medicamentos)</option>
                <option value="ADMIN">ADMIN (acceso total y finanzas)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={cargando}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold disabled:opacity-60"
            >
              {cargando ? 'Guardando...' : 'Crear Cuenta'}
            </button>
          </div>
        </form>

        {/* Ver y cambiar contraseñas de usuarios */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          <h3 className="text-sm font-bold text-slate-800">
            Contraseñas de Usuarios ({usuariosEmpresa.length})
          </h3>
          {usuariosEmpresa.map((u) => (
            <div
              key={u.id}
              className="p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <p className="font-bold text-slate-900">
                  {u.nombre} <span className="text-emerald-700">({u.rol})</span>
                </p>
                <p className="text-slate-500">{u.email}</p>
                <p className="text-slate-700 mt-0.5">
                  Contraseña actual: <strong>{u.password_visible || '(no registrada)'}</strong>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Nueva clave"
                  value={nuevasClaves[u.id] || ''}
                  onChange={(e) =>
                    setNuevasClaves((prev) => ({ ...prev, [u.id]: e.target.value }))
                  }
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs w-28"
                />
                <button
                  type="button"
                  disabled={actualizandoId === u.id}
                  onClick={() => handleCambiarPassword(u.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold disabled:opacity-50"
                >
                  {actualizandoId === u.id ? '...' : 'Cambiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
