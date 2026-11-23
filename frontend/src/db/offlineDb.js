import Dexie from 'dexie';

// Base de datos local en el navegador/celular que persiste sin internet
export const db = new Dexie('AgroControlOfflineDB');

db.version(1).stores({
  lotes: 'id, empresa_id, especie, estado',
  seguimientos: 'id, lote_id, fecha_registro, sincronizado', // sincronizado: 0 (pendiente) | 1 (subido)
  gastos: 'id, lote_id, categoria, fecha, sincronizado',
  cerdas_reproduccion: 'id, lote_id, arete_hembra, estado, sincronizado',
  personal: 'id, empresa_id, email, rol, activo'
});

// Función automática que envía los datos pendientes cuando regresa el internet
export async function sincronizarConServidor(apiUrl, token) {
  if (!navigator.onLine) return { status: 'offline' };

  const seguimientosPendientes = await db.seguimientos
    .where('sincronizado')
    .equals(0)
    .toArray();
  const gastosPendientes = await db.gastos.where('sincronizado').equals(0).toArray();

  if (seguimientosPendientes.length === 0 && gastosPendientes.length === 0) {
    return { status: 'up_to_date', count: 0 };
  }

  const response = await fetch(`${apiUrl}/api/lotes/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      seguimientos: seguimientosPendientes,
      gastos: gastosPendientes
    })
  });

  if (response.ok) {
    await db.seguimientos.bulkUpdate(
      seguimientosPendientes.map((s) => ({ key: s.id, changes: { sincronizado: 1 } }))
    );
    await db.gastos.bulkUpdate(
      gastosPendientes.map((g) => ({ key: g.id, changes: { sincronizado: 1 } }))
    );
    return {
      status: 'synced',
      count: seguimientosPendientes.length + gastosPendientes.length
    };
  }
  return { status: 'error' };
}
