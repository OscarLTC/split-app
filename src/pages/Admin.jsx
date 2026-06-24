import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { db } from "../lib/supabase.js";
import {
  flattenUnits,
  buildItems,
  totalToCollect,
  payerCount,
  sharePerPayer,
  fmt,
} from "../lib/split.js";
import { downloadTemplate, parseDishesFile } from "../lib/excel.js";
import { ADMIN_KEY } from "./AdminGate.jsx";

const STEPS = ["Cargar platos", "Gestionar", "Publicar"];

export default function Admin() {
  // view: "list" (inicio) | "load" | "manage" (wizard) | "tracking"
  const [view, setView] = useState("list");
  const [dishes, setDishes] = useState([{ name: "", qty: 1, unit: "" }]);
  const [units, setUnits] = useState([]);
  const [config, setConfig] = useState({});
  const [bill, setBill] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [yapePhone, setYapePhone] = useState("");
  const [yapeQrFile, setYapeQrFile] = useState(null);
  const [yapeQrPreview, setYapeQrPreview] = useState(null);

  function startNew() {
    setDishes([{ name: "", qty: 1, unit: "" }]);
    setUnits([]);
    setConfig({});
    setBill(null);
    setView("load");
  }

  function onYapeQr(e) {
    const f = e.target.files[0] || null;
    setYapeQrFile(f);
    setYapeQrPreview(f ? URL.createObjectURL(f) : null);
  }
  function clearYapeQr() {
    setYapeQrFile(null);
    setYapeQrPreview(null);
  }

  function goToManage() {
    const valid = dishes.filter((d) => d.name.trim() !== "");
    const u = flattenUnits(valid);
    const cfg = {};
    u.forEach((x) => { cfg[x.id] = { shared: false }; });
    setUnits(u);
    setConfig(cfg);
    setView("manage");
  }

  async function publish() {
    setPublishing(true);
    const items = buildItems(units, config);
    const id = "cobro-" + Date.now();

    // Sube el QR de Yape si lo cargó (opcional).
    let yape_qr_url = null;
    if (yapeQrFile) {
      const ext = (yapeQrFile.name.split(".").pop() || "png").toLowerCase();
      const { error: upErr } = await db.storage
        .from("evidencias")
        .upload(`qr/${id}.${ext}`, yapeQrFile, { upsert: true });
      if (upErr) { setPublishing(false); alert("No se pudo subir el QR de Yape: " + upErr.message); return; }
      yape_qr_url = db.storage.from("evidencias").getPublicUrl(`qr/${id}.${ext}`).data.publicUrl;
    }

    const { error } = await db.from("bills").insert({
      id,
      items,
      total_amount: totalToCollect(units),
      yape_phone: yapePhone.trim() || null,
      yape_qr_url,
    });
    setPublishing(false);
    if (error) { alert("No se pudo publicar el cobro: " + error.message); return; }
    setBill({ id, items, yape_phone: yapePhone.trim() || null, yape_qr_url });
    setView("tracking");
  }

  const stepIndex = view === "load" ? 0 : view === "manage" ? 1 : 2;

  function logout() {
    localStorage.removeItem(ADMIN_KEY);
    window.location.reload();
  }

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem" }}>
        <div className="logo" style={{ marginBottom: 0 }}>Split · Admin</div>
        <button className="btn btn-ghost" style={{ padding: "6px 13px", fontSize: 12.5 }} onClick={logout}>Salir</button>
      </div>

      {view === "list" && (
        <BillsList onOpen={(b) => { setBill(b); setView("tracking"); }} onNew={startNew} />
      )}

      {(view === "load" || view === "manage") && <Stepper current={stepIndex} />}

      {view === "load" && (
        <LoadStep dishes={dishes} setDishes={setDishes} onNext={goToManage} onCancel={() => setView("list")} />
      )}
      {view === "manage" && (
        <ManageStep
          units={units}
          config={config}
          setConfig={setConfig}
          onBack={() => setView("load")}
          onPublish={publish}
          publishing={publishing}
          yapePhone={yapePhone}
          setYapePhone={setYapePhone}
          yapeQrPreview={yapeQrPreview}
          onYapeQr={onYapeQr}
          clearYapeQr={clearYapeQr}
        />
      )}
      {view === "tracking" && bill && (
        <TrackingView bill={bill} onBack={() => setView("list")} />
      )}
    </div>
  );
}

function Stepper({ current }) {
  return (
    <div className="steps">
      {STEPS.map((s, i) => (
        <div key={s} className={"step" + (i === current ? " active" : i < current ? " done" : "")}>
          {i + 1}. {s}
        </div>
      ))}
    </div>
  );
}

/* ---------- Inicio: lista de cobros ---------- */
function BillsList({ onOpen, onNew }) {
  const [bills, setBills] = useState(null); // null = cargando
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: b }, { data: p }] = await Promise.all([
        db.from("bills").select("id, items, total_amount, created_at").order("created_at", { ascending: false }),
        db.from("payments").select("bill_id, amount"),
      ]);
      if (!active) return;
      setBills(b || []);
      setPayments(p || []);
    })();

    // Actualiza el avance en vivo cuando entra cualquier pago.
    const channel = db
      .channel("bills-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" },
        (payload) => setPayments((prev) => [...prev, payload.new]))
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, []);

  // bill_id -> { count, sum }
  const progress = useMemo(() => {
    const m = {};
    payments.forEach((p) => {
      const e = (m[p.bill_id] = m[p.bill_id] || { count: 0, sum: 0 });
      e.count += 1;
      e.sum += Number(p.amount) || 0;
    });
    return m;
  }, [payments]);

  async function remove(e, b) {
    e.stopPropagation();
    if (!confirm("¿Borrar este cobro y todos sus pagos? No se puede deshacer.")) return;
    const { data, error } = await db.from("bills").delete().eq("id", b.id).select();
    if (error) { alert("No se pudo borrar: " + error.message); return; }
    if (!data || data.length === 0) {
      alert("No se borró (falta el permiso de DELETE en Supabase). Corre la migración del README/schema.sql.");
      return;
    }
    setBills((prev) => prev.filter((x) => x.id !== b.id));
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Cobros</h1>
        <button className="btn btn-primary" onClick={onNew}>+ Nuevo cobro</button>
      </div>
      <p className="subtitle">Mira el avance de cada cobro o crea uno nuevo.</p>

      {bills === null ? (
        <div className="state-msg">Cargando cobros...</div>
      ) : bills.length === 0 ? (
        <div className="card"><div className="dish-meta">Aún no hay cobros. Crea el primero con “Nuevo cobro”.</div></div>
      ) : (
        bills.map((b) => {
          const total = b.items.length;
          const prog = progress[b.id] || { count: 0, sum: 0 };
          const done = prog.count >= total;
          return (
            <div key={b.id} className="pay-card" onClick={() => onOpen(b)}>
              <div className="card-header">
                <div className="card-name">
                  {fechaCorta(b.created_at)}
                  <div className="dish-meta">{prog.count}/{total} pagados · {fmt(prog.sum)} de {fmt(b.total_amount)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={"badge " + (done ? "badge-green" : "badge-amber")}>{done ? "✓ Finalizado" : "Pendiente"}</span>
                  <button className="icon-btn icon-btn-sm" title="Borrar cobro" aria-label="Borrar cobro" onClick={(e) => remove(e, b)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

function fechaCorta(iso) {
  try {
    return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

/* ---------- Paso 1: cargar platos ---------- */
function LoadStep({ dishes, setDishes, onNext, onCancel }) {
  const update = (i, field, value) =>
    setDishes(dishes.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  const addDish = () => setDishes([...dishes, { name: "", qty: 1, unit: "" }]);
  const removeDish = (i) => setDishes(dishes.filter((_, idx) => idx !== i));

  const subtotal = dishes.reduce(
    (s, d) => s + (Math.max(1, parseInt(d.qty) || 1)) * (Number(d.unit) || 0),
    0
  );
  const canNext = dishes.some((d) => d.name.trim() !== "");

  async function handleImport(e) {
    const file = e.target.files[0];
    e.target.value = ""; // permite re-importar el mismo archivo
    if (!file) return;
    try {
      const parsed = await parseDishesFile(file);
      if (parsed.length === 0) {
        alert("No encontré platos en el archivo. Usa la plantilla (columnas: Plato, Cantidad, Precio).");
        return;
      }
      // Reemplaza filas vacías; si ya había platos escritos, los conserva y agrega.
      const existing = dishes.filter((d) => d.name.trim() !== "");
      setDishes([...existing, ...parsed]);
    } catch (err) {
      alert("No se pudo leer el archivo: " + err.message);
    }
  }

  return (
    <>
      <h1>Carga los platos</h1>
      <p className="subtitle">Agrégalos a mano, o importa un Excel con la plantilla.</p>

      <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={downloadTemplate}>↓ Descargar plantilla</button>
        <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
          ↑ Importar Excel
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleImport} />
        </label>
      </div>

      <div className="card">
        {dishes.map((d, i) => (
          <div className="form-grid" key={i}>
            <input
              className="input grow"
              placeholder="Nombre del plato"
              value={d.name}
              onChange={(e) => update(i, "name", e.target.value)}
            />
            <input
              className="input qty"
              type="number"
              min="1"
              value={d.qty}
              onChange={(e) => update(i, "qty", e.target.value)}
              aria-label="Cantidad"
            />
            <input
              className="input price"
              type="number"
              min="0"
              step="0.10"
              placeholder="0.00"
              value={d.unit}
              onChange={(e) => update(i, "unit", e.target.value)}
              aria-label="Precio unitario"
            />
            <button className="icon-btn" onClick={() => removeDish(i)} title="Quitar" disabled={dishes.length === 1}>×</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-block" onClick={addDish} style={{ marginTop: 4 }}>+ Agregar plato</button>
      </div>

      <div className="metrics">
        <div className="metric"><div className="metric-label">Líneas</div><div className="metric-value">{dishes.length}</div></div>
        <div className="metric"><div className="metric-label">Subtotal</div><div className="metric-value">{fmt(subtotal)}</div></div>
        <div className="metric"><div className="metric-label">Platos</div><div className="metric-value">{dishes.reduce((s, d) => s + Math.max(1, parseInt(d.qty) || 1), 0)}</div></div>
      </div>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onCancel}>← Cobros</button>
        <button className="btn btn-primary" onClick={onNext} disabled={!canNext}>Continuar →</button>
      </div>
    </>
  );
}

/* ---------- Paso 2: gestionar (dividir) ---------- */
function ManageStep({ units, config, setConfig, onBack, onPublish, publishing, yapePhone, setYapePhone, yapeQrPreview, onYapeQr, clearYapeQr }) {
  const total = totalToCollect(units);
  const sharedCount = units.filter((u) => config[u.id].shared).length;
  const payers = payerCount(units, config);
  const share = sharePerPayer(units, config);
  const noPayers = sharedCount > 0 && payers === 0;

  const toggleShared = (id, val) =>
    setConfig((prev) => ({ ...prev, [id]: { shared: val } }));

  return (
    <>
      <h1>Gestiona el cobro</h1>
      <p className="subtitle">Marca los platos que se dividen (ej: lo del cumpleañero). Se reparten entre todos los que pagan.</p>

      {sharedCount > 0 && (
        <div className={noPayers ? "banner-done" : "card"} style={noPayers ? { background: "var(--amber-bg)", borderColor: "var(--amber-border)", color: "var(--amber)" } : { textAlign: "center", fontSize: 13 }}>
          {noPayers
            ? "⚠ Todos los platos están divididos: debe quedar al menos uno sin dividir (alguien tiene que pagar)."
            : <>Cada una de las <b>{payers}</b> personas que paga cubre <b>su plato + {fmt(share)}</b> de lo compartido.</>}
        </div>
      )}

      <div className="section-label" style={{ marginTop: "1.25rem" }}>Platos ({units.length})</div>
      <div className="card">
        {units.map((u) => {
          const shared = config[u.id].shared;
          return (
            <div className="dish-row" key={u.id}>
              <div className="dish-info">
                <div className="dish-name">{u.name}</div>
                <div className="dish-meta">{shared ? "↪ se reparte entre los que pagan" : `1 plato${share > 0 && !noPayers ? ` + ${fmt(share)} compartido` : ""}`}</div>
              </div>
              <div className="dish-right">
                <div className="dish-price">{fmt(u.unit)}</div>
                <div className="toggle-row">
                  <span className="toggle-label">Dividir</span>
                  <label className="toggle">
                    <input type="checkbox" checked={shared} onChange={(e) => toggleShared(u.id, e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="metrics">
        <div className="metric"><div className="metric-label">Pagan</div><div className="metric-value">{payers}</div></div>
        <div className="metric"><div className="metric-label">Divididos</div><div className="metric-value">{sharedCount}</div></div>
        <div className="metric"><div className="metric-label">Total</div><div className="metric-value">{fmt(total)}</div></div>
      </div>

      <div className="section-label" style={{ marginTop: "1.5rem" }}>¿A dónde te pagan? (Yape)</div>
      <div className="card">
        <div style={{ marginBottom: yapeQrPreview ? 12 : 0 }}>
          <label className="form-label">Tu número de Yape</label>
          <input
            className="input"
            type="tel"
            inputMode="numeric"
            placeholder="Ej: 999 888 777"
            value={yapePhone}
            onChange={(e) => setYapePhone(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="form-label">Tu QR de Yape (opcional)</label>
          {!yapeQrPreview ? (
            <label className="upload-zone">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><line x1="14" y1="14" x2="14" y2="21" /><line x1="21" y1="14" x2="21" y2="21" /><line x1="14" y1="17" x2="21" y2="17" />
              </svg>
              <span>Toca para subir tu QR</span>
              <input type="file" accept="image/*" onChange={onYapeQr} hidden />
            </label>
          ) : (
            <div className="upload-preview">
              <img src={yapeQrPreview} alt="QR Yape" />
              <button type="button" className="btn btn-ghost" onClick={clearYapeQr}>Quitar</button>
            </div>
          )}
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onBack}>← Volver</button>
        <button className="btn btn-primary" onClick={onPublish} disabled={publishing || noPayers}>
          {publishing ? "Publicando..." : "Publicar cobro"}
        </button>
      </div>
    </>
  );
}

/* ---------- Seguimiento de un cobro (link, QR, pagos en vivo) ---------- */
function TrackingView({ bill, onBack }) {
  const url = `${window.location.origin}/pay?id=${bill.id}`;
  const [qr, setQr] = useState("");
  const [payments, setPayments] = useState([]);
  const [copied, setCopied] = useState(false);

  const itemNames = useMemo(() => {
    const m = {};
    bill.items.forEach((it) => { m[it.key] = it.name; });
    return m;
  }, [bill]);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 180, margin: 1 }).then(setQr).catch(() => {});
  }, [url]);

  useEffect(() => {
    let active = true;
    db.from("payments").select("*").eq("bill_id", bill.id).then(({ data }) => {
      if (active) setPayments(data || []);
    });
    const channel = db
      .channel("admin-" + bill.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments", filter: "bill_id=eq." + bill.id },
        (payload) => setPayments((prev) => [...prev, payload.new]))
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [bill.id]);

  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const done = payments.length >= bill.items.length;

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <h1>Seguimiento del cobro</h1>
      <p className="subtitle">Comparte el link o el QR. Verás los pagos aquí en vivo.</p>

      <div className="metrics">
        <div className="metric"><div className="metric-label">Pagados</div><div className="metric-value">{payments.length}/{bill.items.length}</div></div>
        <div className="metric"><div className="metric-label">Cobrado</div><div className="metric-value">{fmt(paid)}</div></div>
        <div className="metric"><div className="metric-label">Estado</div><div className="metric-value">{done ? "✓" : "…"}</div></div>
      </div>

      {done && <div className="banner-done">✓ Cobro finalizado — todos los platos están pagados</div>}

      <div className="publish-box">
        <div className="section-label">Link para compartir</div>
        <div className="link-box">{url}</div>
        {qr && <div className="qr-wrap"><img src={qr} alt="QR" /></div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={copy}>{copied ? "¡Copiado!" : "Copiar link"}</button>
          <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">Abrir vista invitado</a>
        </div>

        <div className="section-label" style={{ marginTop: "1.5rem" }}>Quién ha pagado</div>
        <div className="card">
          {payments.length === 0 ? (
            <div className="dish-meta">Aún nadie ha pagado.</div>
          ) : (
            [...payments]
              .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
              .map((p) => (
                <div className="dish-row" key={p.item_key}>
                  <div className="dish-info">
                    <div className="dish-name">{p.name}</div>
                    <div className="dish-meta">{itemNames[p.item_key] || p.item_key}</div>
                    {p.evidence_url && (
                      <a href={p.evidence_url} target="_blank" rel="noreferrer" className="dish-meta" style={{ color: "var(--blue)", display: "inline-block", marginTop: 2 }}>📎 Ver captura</a>
                    )}
                  </div>
                  <div className="dish-right">
                    <div className="dish-price">{fmt(p.amount)}</div>
                    <span className="badge badge-green">✓ Pagado</span>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onBack}>← Cobros</button>
      </div>
    </>
  );
}
