import * as XLSX from 'xlsx';

export function exportarReporteContableExcel(
  nombreArchivo = 'Reporte_AgroControl',
  lotes = [],
  movimientos = [],
  seguimientos = []
) {
  const wb = XLSX.utils.book_new();

  const resumenLotes = lotes.map((l) => {
    const compra = Number(l.costo_compra_total || 0);
    const venta = Number(l.valor_venta_total || 0);
    const pesoIni = Number(l.peso_inicial_kg || 0);
    const pesoFin = Number(l.peso_final_kg || 0);
    return {
      Codigo: l.codigo,
      Nombre: l.nombre,
      Especie: l.especie,
      Cantidad_Inicial: Number(l.cantidad_inicial || 0),
      Cantidad_Actual: Number(l.cantidad_actual ?? l.cantidad_inicial ?? 0),
      Peso_Inicial_Kg: pesoIni,
      Peso_Final_Kg: pesoFin,
      Ganancia_Peso_Kg: Number((pesoFin - pesoIni).toFixed(2)),
      Valor_Compra: compra,
      Valor_Venta: venta,
      Margen_Lote: Number((venta - compra).toFixed(2)),
      Estado: l.estado || 'ACTIVO',
      Fecha_Inicio: l.fecha_inicio
    };
  });

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(resumenLotes.length ? resumenLotes : [{ Nota: 'Sin lotes' }]),
    'Lotes_y_Carnicos'
  );

  const hojaFinanzas = movimientos.map((m) => ({
    Fecha: m.fecha,
    Tipo: m.tipo || 'GASTO',
    Categoria: m.categoria,
    Descripcion: m.descripcion,
    Lote_Codigo: m.lote_codigo || '',
    Monto: Number(m.monto || 0),
    Factura: m.url_factura || ''
  }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      hojaFinanzas.length ? hojaFinanzas : [{ Nota: 'Sin movimientos financieros' }]
    ),
    'Movimientos_Financieros'
  );

  const hojaSeg = seguimientos.map((s) => ({
    Fecha: s.fecha_registro,
    Lote_Codigo: s.lote_codigo || s.lote_id || '',
    Responsable: s.autor_nombre || '',
    Tipo_Control: s.tipo_registro,
    Valor: Number(s.valor_principal || 0),
    Alimento_Kg: Number(s.alimento_kg || 0),
    Ingresos_Animales: Number(s.ingresos_animales || 0),
    Mortalidad: Number(s.mortalidad || 0),
    Observaciones: s.observaciones || ''
  }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(hojaSeg.length ? hojaSeg : [{ Nota: 'Sin seguimientos' }]),
    'Seguimientos_y_Notas'
  );

  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}
