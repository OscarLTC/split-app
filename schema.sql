-- ============================================================
-- Split App — Esquema de base de datos para Supabase
-- Pégalo entero en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Cada cobro publicado (una cuenta de restaurante).
-- Los platos se guardan en `items` como JSON.
create table if not exists bills (
  id            text primary key,
  items         jsonb not null,
  total_amount  numeric not null,
  created_at    timestamptz not null default now()
);

-- Un pago = una fila. La clave primaria (bill_id, item_key) hace que un mismo
-- plato no se pueda pagar dos veces: el segundo intento falla automáticamente.
create table if not exists payments (
  bill_id     text not null references bills(id) on delete cascade,
  item_key    text not null,
  name        text not null,
  amount      numeric not null,
  created_at  timestamptz not null default now(),
  primary key (bill_id, item_key)
);

-- Realtime: permite que admin e invitados vean los pagos al instante.
alter publication supabase_realtime add table payments;

-- ------------------------------------------------------------
-- Seguridad (RLS). Versión simple y abierta, equivalente al
-- "modo prueba" de Firebase. Suficiente para un cobro entre amigos.
-- Para producción real, restringe estas políticas.
-- ------------------------------------------------------------
alter table bills    enable row level security;
alter table payments enable row level security;

create policy "bills: lectura publica"     on bills    for select using (true);
create policy "bills: insertar publico"    on bills    for insert with check (true);
create policy "bills: borrar publico"      on bills    for delete using (true);
create policy "payments: lectura publica"  on payments for select using (true);
create policy "payments: insertar publico" on payments for insert with check (true);
-- Nota: borrar un cobro (bills) arrastra sus pagos por el ON DELETE CASCADE.

-- ------------------------------------------------------------
-- Evidencia de pago (captura opcional) — Supabase Storage
-- ------------------------------------------------------------
-- URL pública de la captura en cada pago (puede ser NULL).
alter table payments add column if not exists evidence_url text;

-- Datos de cobro del organizador (a dónde paga la gente).
alter table bills add column if not exists yape_phone text;
alter table bills add column if not exists yape_qr_url text;

-- Bucket público para las capturas.
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

-- Permitir subir (anon) y leer las capturas de ese bucket.
create policy "evidencias: subir publico"
  on storage.objects for insert with check (bucket_id = 'evidencias');
create policy "evidencias: leer publico"
  on storage.objects for select using (bucket_id = 'evidencias');
