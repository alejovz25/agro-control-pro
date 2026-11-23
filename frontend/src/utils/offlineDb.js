import Dexie from 'dexie';

const db = new Dexie('AgroControlProDB');

db.version(1).stores({
  lotes: 'id, codigo, especie, estado, fecha_inicio',
  seguimientos: 'id, lote_id, tipo_registro, fecha_registro, pendiente_sync',
  gastos: 'id, lote_id, categoria, fecha, pendiente_sync'
});

export default db;
