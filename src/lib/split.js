// Lógica de negocio del split, sin nada de UI (fácil de razonar y testear).

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const fmt = (n) => "S/ " + (Number(n) || 0).toFixed(2);

// Aplana la lista de platos (cantidad 3 -> 3 unidades individuales).
// dishes: [{ name, qty, unit }]  ->  units: [{ id, name, unit }]
export function flattenUnits(dishes) {
  const units = [];
  dishes.forEach((d, di) => {
    const qty = Math.max(1, parseInt(d.qty) || 1);
    for (let u = 0; u < qty; u++) {
      units.push({ id: `d${di}_u${u}`, name: d.name.trim(), unit: Number(d.unit) || 0 });
    }
  });
  return units;
}

const cents = (n) => Math.round((Number(n) || 0) * 100);

// Cuántos platos siguen "activos" (no divididos) = la gente que paga su parte.
export function payerCount(units, config) {
  return units.filter((u) => !config[u.id]?.shared).length;
}

// Suma de lo dividido (el "pool" que absorben los que pagan).
export function sharedPool(units, config) {
  return round2(
    units.filter((u) => config[u.id]?.shared).reduce((s, u) => s + (Number(u.unit) || 0), 0)
  );
}

// Cuánto compartido le toca a cada persona que paga (referencia para la UI).
export function sharePerPayer(units, config) {
  const n = payerCount(units, config);
  return n > 0 ? round2(sharedPool(units, config) / n) : 0;
}

// Expande las unidades a los items cobrables (uno por persona que paga).
// Cada item = su propio plato + su parte de lo dividido, en una sola selección.
// El reparto de centavos es exacto: la suma de los items = el total, sin descuadre.
export function buildItems(units, config) {
  const payers = units.filter((u) => !config[u.id]?.shared);
  if (payers.length === 0) {
    // Sin nadie que pague (se bloquea en el admin); devolvemos los platos tal cual.
    return units.map((u) => ({ key: u.id, name: u.name, amount: round2(u.unit), base: round2(u.unit), share: 0, shared: false }));
  }
  const poolCents = units
    .filter((u) => config[u.id]?.shared)
    .reduce((s, u) => s + cents(u.unit), 0);
  const baseShare = Math.floor(poolCents / payers.length);
  const remainder = poolCents - baseShare * payers.length; // céntimos sobrantes

  return payers.map((u, idx) => {
    const shareCents = baseShare + (idx < remainder ? 1 : 0); // reparte el sobrante
    const plateCents = cents(u.unit);
    return {
      key: u.id,
      name: u.name,
      amount: (plateCents + shareCents) / 100,
      base: plateCents / 100,
      share: shareCents / 100,
      shared: false,
    };
  });
}

// Total a cobrar = suma de todos los precios (el dinero se conserva: lo que no
// paga el cumpleañero lo absorben los demás).
export function totalToCollect(units) {
  return round2(units.reduce((s, u) => s + (Number(u.unit) || 0), 0));
}
