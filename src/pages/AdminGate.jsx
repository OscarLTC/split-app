import { useState } from "react";

const PASS = import.meta.env.VITE_ADMIN_PASSCODE || "";
export const ADMIN_KEY = "split_admin_ok";

// Gate simple por código para la vista admin. No es seguridad fuerte
// (el código viaja en el front), solo evita el acceso casual.
export default function AdminGate({ children }) {
  const [ok, setOk] = useState(() => localStorage.getItem(ADMIN_KEY) === "1");
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  if (ok) return children;

  function submit(e) {
    e.preventDefault();
    if (PASS && val === PASS) {
      localStorage.setItem(ADMIN_KEY, "1");
      setOk(true);
    } else {
      setErr(true);
    }
  }

  return (
    <div className="container narrow">
      <div className="logo">Split · Admin</div>
      <div className="card" style={{ textAlign: "center", padding: "2.4rem 1.6rem" }}>
        <div className="lock-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 style={{ marginBottom: 6 }}>Acceso restringido</h2>
        <p className="subtitle" style={{ marginBottom: "1.4rem" }}>Ingresa el código de administrador.</p>
        <form onSubmit={submit}>
          <input
            className="input"
            type="password"
            autoFocus
            value={val}
            onChange={(e) => { setVal(e.target.value); setErr(false); }}
            placeholder="Código"
            style={{ textAlign: "center" }}
          />
          {err && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 9, fontWeight: 500 }}>Código incorrecto</div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }}>Entrar</button>
        </form>
      </div>
    </div>
  );
}
