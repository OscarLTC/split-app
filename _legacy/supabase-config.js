// PASO 1: Reemplaza estos valores con los de tu proyecto Supabase.
// Ve a supabase.com → tu proyecto → Project Settings → API
//   - Project URL        → SUPABASE_URL
//   - anon public key     → SUPABASE_ANON_KEY  (la "anon", NO la service_role)

const SUPABASE_URL = "https://kajrzdoixrhkjalkwzbp.supabase.co";       // ej: https://abcdxyz.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthanJ6ZG9peHJoa2phbGt3emJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzA0NDAsImV4cCI6MjA5NzkwNjQ0MH0.-ezkMA3Bsg8hyi32pGHJjs4Ux3VPSo4YocqtDp7N7rU";      // ej: eyJhbGciOi...

// `supabase` viene del script CDN (window.supabase). Creamos el cliente y lo
// llamamos `db` para que el resto del código se lea parecido a la versión Firebase.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
