# Split App (React + Vite + Supabase)

App para dividir la cuenta de un restaurante y cobrar a cada invitado por link/QR.
El admin carga los platos, los gestiona (marca cuáles se dividen) y publica el cobro;
los invitados pagan su parte desde el link y el admin ve el avance en tiempo real.

## Flujo del admin (3 pasos)
1. **Cargar platos** → nombre, cantidad y precio (formulario manual).
2. **Gestionar** → marca los platos divididos (ej. lo del cumpleañero). El "entre
   cuántos" se autocompleta con los platos que siguen activos, y es editable.
3. **Publicar** → genera link + QR, guarda en Supabase y muestra el avance en vivo.
   Cuando todos los platos están pagados, el cobro se marca como **finalizado**.

## Estructura
- `src/pages/Admin.jsx` → vista admin (los 3 pasos)
- `src/pages/Guest.jsx` → vista invitado (`/pay?id=...`)
- `src/lib/split.js` → lógica del split (aplanar platos, dividir, totales)
- `src/lib/supabase.js` → cliente de Supabase (lee `.env`)
- `schema.sql` → tablas `bills` y `payments` para Supabase
- `_legacy/` → versión anterior en HTML plano (solo referencia)

---

## Puesta en marcha (local)

```bash
npm install
npm run dev        # http://localhost:5173
```

Necesitas un archivo `.env` con tus credenciales de Supabase (ver `.env.example`):

```
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> La `anon key` es pública y segura en el navegador (la seguridad real está en las
> políticas RLS de `schema.sql`). Nunca pongas aquí la `service_role`.

### Base de datos
Una sola vez: Supabase → **SQL Editor** → pega `schema.sql` → **Run**
(crea `bills` y `payments`, activa Realtime y los permisos).

---

## Deploy en Vercel

1. Sube el repo a GitHub e **Import** en Vercel (detecta Vite solo).
2. En **Settings → Environment Variables** agrega `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` con tus valores.
3. Deploy. El `vercel.json` ya incluye el rewrite de SPA para que `/pay` funcione.

---

## Pendientes / ideas
- Importar platos desde **foto del ticket** (OCR/IA) — segunda etapa.
- Ajuste opcional al "total real" del recibo (propina/servicio) vía prorrateo.
