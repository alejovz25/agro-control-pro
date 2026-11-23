import * as XLSX from 'xlsx';

export function exportarReporteContableExcel(empresaNombre, lotes, gastos, seguimientos) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Balance Financiero por Lote
  const resumenLotes = lotes.map((lote) => {
    const gastosLote = gastos
      .filter((g) => g.lote_id === lote.id)
      .reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const inversionTotal = Number(lote.costo_compra_total || 0) + gastosLote;
    const utilidad = Number(lote.valor_venta_total || 0) - inversionTotal;

    return {
      'Código Lote': lote.codigo,
      Nombre: lote.nombre,
      Especie: lote.especie,
      'Animales Actuales': Number(lote.cantidad_actual || 0),
      'Compra Inicial ($)': Number(lote.costo_compra_total || 0),
      'Gastos Producción ($)': gastosLote,
      'Inversión Acumulada ($)': inversionTotal,
      'Ventas Registradas ($)': Number(lote.valor_venta_total || 0),
      'Balance Neto ($)': utilidad,
      Estado: lote.estado
    };
  });
  const wsResumen = XLSX.utils.json_to_sheet(resumenLotes);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Balance por Lote');

  // Hoja 2: Detalle de Gastos y Facturas
  const detalleGastos = gastos.map((g) => ({
    Fecha: g.fecha,
    'Lote ID': g.lote_id || 'General',
    Categoría: g.categoria,
    Descripción: g.descripcion,
    'Monto ($)': Number(g.monto || 0),
    'Soporte / Factura': g.nombre_archivo || g.url_factura || 'Sin adjunto'
  }));
  const wsGastos = XLSX.utils.json_to_sheet(detalleGastos);
  XLSX.utils.book_append_sheet(wb, wsGastos, 'Gastos y Facturas');

  // Hoja 3: Historial Productivo (Leche, Peso, Huevos)
  const historialProd = seguimientos.map((s) => ({
    Fecha: s.fecha_registro,
    'Lote ID': s.lote_id,
    'Tipo Control': s.tipo_registro,
    'Valor Registrado': Number(s.valor_principal || 0),
    'Alimento (kg)': Number(s.alimento_kg || 0),
    Mortalidad: Number(s.mortalidad || 0),
    Observaciones: s.observaciones || ''
  }));
  const wsProd = XLSX.utils.json_to_sheet(historialProd);
  XLSX.utils.book_append_sheet(wb, wsProd, 'Historial Producción');

  const nombreLimpio = (empresaNombre || 'AgroControl').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Reporte_Contable_${nombreLimpio}.xlsx`);
}
