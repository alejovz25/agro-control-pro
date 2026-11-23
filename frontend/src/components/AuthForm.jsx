import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function AuthForm({ onAuthSuccess }) {
  const [modoRegistro, setModoRegistro] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    nombre_empresa: '',
    nit_rut: '',
    moneda: 'COP',
    nombre_usuario: '',
    email: '',
    password: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    const endpoint = modoRegistro ? '/api/auth/register' : '/api/auth/login';
    const payload = modoRegistro
      ? form
      : { email: form.email, password: form.password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error en la autenticación');
        return;
      }

      localStorage.setItem('agro_token', data.token);
      localStorage.setItem('agro_usuario', JSON.stringify(data.usuario));
      localStorage.setItem('agro_empresa', JSON.stringify(data.empresa));
      onAuthSuccess(data);
    } catch (err) {
      setError(
        `No se pudo conectar con el servidor (${API_URL}). Verifica que el backend esté encendido en la terminal.`
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-800">AgroControl Pro</h1>
          <p className="text-xs text-slate-500 mt-1">
            {modoRegistro ? 'Crea tu cuenta empresarial' : 'Inicia sesión en tu finca'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-800 text-xs p-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {modoRegistro && (
            <>
              <input
                type="text"
                placeholder="Nombre de la Finca o Empresa"
                value={form.nombre_empresa}
                onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="NIT o RUT"
                  value={form.nit_rut}
                  onChange={(e) => setForm({ ...form, nit_rut: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  required
                />
                <select
                  value={form.moneda}
                  onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="COP">COP ($)</option>
                  <option value="USD">USD ($)</option>
                  <option value="MXN">MXN ($)</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Tu nombre completo"
                value={form.nombre_usuario}
                onChange={(e) => setForm({ ...form, nombre_usuario: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </>
          )}

          <input
            type="email"
            placeholder="Correo electrónico"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            required
          />

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-50"
          >
            {cargando ? 'Procesando...' : modoRegistro ? 'Crear Cuenta' : 'Entrar'}
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setModoRegistro(!modoRegistro);
              setError('');
            }}
            className="text-xs text-green-700 hover:underline font-medium"
          >
            {modoRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
          </button>
        </div>
      </div>
    </div>
  );
}
