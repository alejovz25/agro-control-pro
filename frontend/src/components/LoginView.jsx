import React, { useState } from 'react';

const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_URL = RAW_API_URL.replace(/\/+$/, '');

function guardarSeguro(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Ignora restricciones de almacenamiento del navegador
  }
}

function normalizarUsuario(data, fallbackEmail = '', fallbackNombre = '') {
  const raw =
    data?.usuario ||
    data?.user ||
    data?.data?.usuario ||
    data?.data?.user ||
    (data?.nombre || data?.email ? data : null);

  if (!raw && !fallbackEmail) return null;

  const fuente = raw || {};
  return {
    id: fuente.id || fuente.userId || '',
    empresa_id: fuente.empresa_id || fuente.empresaId || data?.empresa?.id || '',
    nombre: fuente.nombre || fuente.name || fallbackNombre || fallbackEmail || 'Usuario',
    email: fuente.email || fallbackEmail,
    rol: String(fuente.rol || fuente.role || 'ADMIN').toUpperCase()
  };
}

export default function LoginView({ onLoginSuccess }) {
  const [modo, setModo] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [nitRut, setNitRut] = useState('');
  const [moneda, setMoneda] = useState('COP');
  const [nombreAdmin, setNombreAdmin] = useState('');

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const endpoint =
        modo === 'login' ? `${API_URL}/api/auth/login` : `${API_URL}/api/auth/register-empresa`;

      const emailLimpio = email.trim();
      const nombreAdminLimpio = nombreAdmin.trim();

      const payload =
        modo === 'login'
          ? { email: emailLimpio, password }
          : {
              nombre_empresa: nombreEmpresa.trim(),
              nit_rut: nitRut.trim(),
              moneda,
              nombre_admin: nombreAdminLimpio,
              email: emailLimpio,
              password
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status} al comunicarse con el servidor`);
      }

      const usuarioNormalizado = normalizarUsuario(data, emailLimpio, nombreAdminLimpio);
      if (!usuarioNormalizado) {
        throw new Error('La respuesta del servidor no incluyó los datos del usuario.');
      }

      const tokenRecibido = data.token || data.accessToken || data.jwt || '';
      if (tokenRecibido) {
        guardarSeguro('agro_token', tokenRecibido);
      }
      guardarSeguro('agro_usuario', JSON.stringify(usuarioNormalizado));

      onLoginSuccess({
        ...data,
        token: tokenRecibido,
        usuario: usuarioNormalizado
      });
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        setError(
          `No se pudo conectar con ${API_URL}. Verifica que el backend esté activo, que CORS permita este dominio y que VITE_API_URL esté bien configurado.`
        );
      } else {
        setError(err.message || 'Error al procesar la solicitud');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-emerald-800">AgroControl Pro</h1>
          <p className="text-sm text-slate-500 mt-1">
            Acceso para Administradores, Técnicos y Operarios
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setModo('login');
              setError('');
            }}
            className={`py-2 text-sm font-semibold rounded-lg transition ${
              modo === 'login'
                ? 'bg-emerald-700 text-white shadow'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('register');
              setError('');
            }}
            className={`py-2 text-sm font-semibold rounded-lg transition ${
              modo === 'register'
                ? 'bg-emerald-700 text-white shadow'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Registrar Empresa
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {modo === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre de la Empresa / Finca
                </label>
                <input
                  type="text"
                  required
                  value={nombreEmpresa}
                  onChange={(e) => setNombreEmpresa(e.target.value)}
                  placeholder="Ej. Hacienda El Porvenir"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    NIT / RUT
                  </label>
                  <input
                    type="text"
                    required
                    value={nitRut}
                    onChange={(e) => setNitRut(e.target.value)}
                    placeholder="900123456-7"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                  <select
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="COP">COP ($)</option>
                    <option value="USD">USD ($)</option>
                    <option value="MXN">MXN ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del Administrador
                </label>
                <input
                  type="text"
                  required
                  value={nombreAdmin}
                  onChange={(e) => setNombreAdmin(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@empresa.com"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <input
              type="password"
              required
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition"
          >
            {cargando
              ? 'Procesando...'
              : modo === 'login'
                ? 'Ingresar al Sistema'
                : 'Crear Empresa y Cuenta Admin'}
          </button>
        </form>

        <p className="text-xs text-slate-500 text-center mt-5">
          ¿Eres trabajador? Inicia sesión con el correo y contraseña asignados por tu administrador.
        </p>
      </div>
    </div>
  );
}
