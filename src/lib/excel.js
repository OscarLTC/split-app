import * as XLSX from "xlsx";

// Columnas que entiende el importador (con alias por si las escriben distinto).
const COLS = {
  name: ["Plato", "Nombre", "Descripción", "Descripcion", "Item"],
  qty: ["Cantidad", "Cant", "Qty", "Unidades"],
  unit: ["Precio", "Precio unitario", "Precio Unitario", "Unitario", "P. Unit"],
};

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}

// Descarga una plantilla .xlsx con las columnas correctas y un par de ejemplos.
export function downloadTemplate() {
  const ejemplos = [
    { Plato: "Milanesa de pollo", Cantidad: 2, Precio: 19.9 },
    { Plato: "Fettuccini 3 quesos", Cantidad: 1, Precio: 24.9 },
    { Plato: "Volcán de chocolate", Cantidad: 1, Precio: 26.0 },
  ];
  const ws = XLSX.utils.json_to_sheet(ejemplos, { header: ["Plato", "Cantidad", "Precio"] });
  ws["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Platos");
  XLSX.writeFile(wb, "plantilla-split.xlsx");
}

// Lee un archivo Excel/CSV y lo convierte a la lista de platos del formulario.
export async function parseDishesFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return rows
    .map((r) => ({
      name: String(pick(r, COLS.name) ?? "").trim(),
      qty: Math.max(1, parseInt(pick(r, COLS.qty)) || 1),
      unit: Number(pick(r, COLS.unit)) || 0,
    }))
    .filter((d) => d.name !== "");
}
