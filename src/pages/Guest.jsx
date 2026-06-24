import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/supabase.js";
import { fmt } from "../lib/split.js";

export default function Guest() {
  const [params] = useSearchParams();
  const billId = params.get("id");

  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [bill, setBill] = useState(null);
  const [paidKeys, setPaidKeys] = useState({}); // { item_key: payment }
  const [selectedKey, setSelectedKey] = useState(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // payment confirmado
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!billId) { setStatus("error"); setErrorMsg("Link inválido. Pide el link correcto al organizador."); return; }
    let active = true;

    (async () => {
      const { data, error } = await db.from("bills").select("*").eq("id", billId).maybeSingle();
      if (!active) return;
      if (error) { setStatus("error"); setErrorMsg("Error al cargar el cobro. Intenta de nuevo."); return; }
      if (!data) { setStatus("error"); setErrorMsg("Cobro no encontrado. Verifica el link."); return; }
      setBill(data);
      setStatus("ready");

      const { data: pays } = await db.from("payments").select("*").eq("bill_id", billId);
      if (!active) return;
      const map = {};
      (pays || []).forEach((p) => { map[p.item_key] = p; });
      setPaidKeys(map);
    })();

    const channel = db
      .channel("guest-" + billId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments", filter: "bill_id=eq." + billId },
        (payload) => setPaidKeys((prev) => ({ ...prev, [payload.new.item_key]: payload.new })))
      .subscribe();

    return () => { active = false; db.removeChannel(channel); };
  }, [billId]);

  if (status === "loading") return <Shell><div className="state-msg">Cargando cobro...</div></Shell>;
  if (status === "error") return <Shell><div className="state-msg error">{errorMsg}</div></Shell>;

  const selected = bill.items.find((i) => i.key === selectedKey);

  function select(key) {
    if (done) return;
    setSelectedKey(key);
  }

  function onFile(e) {
    const f = e.target.files[0] || null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function clearSelection() {
    setSelectedKey(null);
    setFile(null);
    setPreview(null);
  }

  function copyYape() {
    navigator.clipboard.writeText(bill.yape_phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function confirm() {
    if (!name.trim() || !selected) return;
    setSaving(true);

    // 1) Sube la captura si la hay (opcional).
    let evidence_url = null;
    if (file) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${billId}/${selected.key}_${Date.now()}.${ext}`;
      const { error: upErr } = await db.storage
        .from("evidencias")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) {
        setSaving(false);
        alert("No se pudo subir la captura: " + upErr.message + "\nIntenta de nuevo o quita la imagen (es opcional).");
        return;
      }
      evidence_url = db.storage.from("evidencias").getPublicUrl(path).data.publicUrl;
    }

    // 2) Registra el pago.
    const { error } = await db.from("payments").insert({
      bill_id: billId,
      item_key: selected.key,
      name: name.trim(),
      amount: selected.amount,
      evidence_url,
    });
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        alert("¡Ups! Alguien acaba de pagar ese plato. Elige otro.");
        clearSelection();
      } else {
        alert("No se pudo registrar el pago: " + error.message);
      }
      return;
    }
    setDone({ name: name.trim(), amount: selected.amount });
    clearSelection();
  }

  const payers = bill.items.length;
  const hasShared = bill.items.some((i) => i.share > 0);

  return (
    <Shell>
      <h1>Paga tu parte</h1>
      <p className="subtitle">
        Selecciona el plato que te corresponde.
        {hasShared && " El precio ya incluye tu parte de lo compartido (repartido entre todos)."}
      </p>

      <div className="section-label">Platos</div>
      {bill.items.map((item) => {
        const p = paidKeys[item.key];
        const taken = !!p;
        const isSel = selectedKey === item.key;
        return (
          <div
            key={item.key}
            className={"pay-card" + (taken ? " taken" : "") + (isSel ? " selected" : "")}
            onClick={() => !taken && select(item.key)}
          >
            <div className="card-header">
              <div className="card-name">
                {item.name}
                {item.share > 0 && (
                  <div className="dish-meta">{fmt(item.base)} plato + {fmt(item.share)} compartido</div>
                )}
              </div>
              <div className="card-price">{fmt(item.amount)}</div>
            </div>
            <div className="card-footer">
              {item.share > 0 && <span className="badge badge-blue">+{fmt(item.share)} compartido ÷ {payers}</span>}
              {taken ? (
                <span className="badge badge-green">✓ {p.name}</span>
              ) : isSel ? (
                <span className="badge badge-amber">Seleccionado</span>
              ) : (
                <span className="badge badge-taken">Disponible</span>
              )}
            </div>
          </div>
        );
      })}

      {selected && !done && (
        <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}>
        <div className="checkout sheet">
          <div className="sheet-handle" />
          <h2>Confirmar pago</h2>
          <div className="summary-box">
            <div className="summary-row"><span style={{ color: "var(--muted)", flex: 1 }}>{selected.name}</span><span>{fmt(selected.base)}</span></div>
            {selected.share > 0 && (
              <div className="summary-row"><span style={{ color: "var(--muted)" }}>+ Compartido (÷ {payers})</span><span>{fmt(selected.share)}</span></div>
            )}
            <div className="summary-row total"><span>Total a pagar</span><span>{fmt(selected.amount)}</span></div>
          </div>

          {(bill.yape_phone || bill.yape_qr_url) && (
            <div className="yape-box">
              <div className="yape-title">Yapea aquí {fmt(selected.amount)}</div>
              {bill.yape_phone && (
                <div className="yape-phone">
                  <span>{bill.yape_phone}</span>
                  <button type="button" className="btn btn-ghost" onClick={copyYape}>{copied ? "¡Copiado!" : "Copiar"}</button>
                </div>
              )}
              {bill.yape_qr_url && <img className="yape-qr" src={bill.yape_qr_url} alt="QR de Yape" />}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Tu nombre *</label>
            <input className="input" value={name} placeholder="Ej: Lucía Torres" onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Captura del pago (opcional)</label>
            {!preview ? (
              <label className="upload-zone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Toca para subir tu captura</span>
                <input type="file" accept="image/*" onChange={onFile} hidden />
              </label>
            ) : (
              <div className="upload-preview">
                <img src={preview} alt="captura" />
                <button type="button" className="btn btn-ghost" onClick={() => { setFile(null); setPreview(null); }}>Quitar</button>
              </div>
            )}
          </div>
          <div className="sheet-actions">
            <button className="btn btn-ghost" onClick={clearSelection} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirm} disabled={saving || !name.trim()}>
              {saving ? "Guardando..." : "Confirmar pago"}
            </button>
          </div>
        </div>
        </div>
      )}

      {done && (
        <div className="success">
          <div className="success-icon">✓</div>
          <h2>¡Pago registrado!</h2>
          <p>{done.name}, tu pago de {fmt(done.amount)} fue registrado. ¡Gracias!</p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="container narrow">
      <div className="logo">Split · Invitado</div>
      {children}
    </div>
  );
}
