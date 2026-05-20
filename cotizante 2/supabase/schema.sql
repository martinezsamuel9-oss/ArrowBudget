-- =====================================================================
-- COTIZANTE — Esquema de base de datos (Supabase / PostgreSQL)
-- =====================================================================
-- Ejecutar este archivo en el SQL Editor de Supabase.
-- Requiere las extensiones pgcrypto (UUID) y la integración con Supabase Auth.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- PERFILES DE USUARIO (vinculado a auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  nombre text,
  empresa text,
  telefono text,
  logo_url text,
  moneda_default text default 'USD',
  pct_indirectos numeric(6,2) default 10,
  pct_imprevistos numeric(6,2) default 1,
  pct_utilidad numeric(6,2) default 8,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger: cuando se crea un user en auth.users, crear su profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- PLANES DE SUSCRIPCIÓN (catálogo)
-- ---------------------------------------------------------------------
create table if not exists public.planes (
  id text primary key,                  -- 'basico', 'pro', 'enterprise'
  nombre text not null,
  precio_mensual numeric(10,2),
  precio_anual numeric(10,2),
  max_proyectos integer,                 -- null = ilimitado
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  paypal_plan_id_monthly text,
  paypal_plan_id_yearly text,
  features jsonb default '[]'::jsonb,
  activo boolean default true,
  orden integer default 0
);

insert into public.planes (id, nombre, precio_mensual, precio_anual, max_proyectos, features, orden) values
  ('basico', 'Básico', 9.99, 99.00, 5,
    '["5 proyectos","Fichas de costo ilimitadas","Exportación PDF","Soporte por email"]'::jsonb, 1),
  ('pro', 'Profesional', 24.99, 249.00, null,
    '["Proyectos ilimitados","PDF + Excel","Plantillas catálogo","Logo personalizado","Soporte prioritario"]'::jsonb, 2),
  ('enterprise', 'Empresarial', 49.99, 499.00, null,
    '["Todo Profesional","Multi-usuario (5)","API access","Onboarding","SLA 99.9%"]'::jsonb, 3)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- SUSCRIPCIONES (estado por usuario)
-- ---------------------------------------------------------------------
create type subscription_status as enum (
  'trialing','active','past_due','canceled','incomplete','unpaid'
);

create type billing_period as enum ('monthly','yearly');

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.planes(id),
  billing_period billing_period not null,
  status subscription_status not null default 'trialing',
  provider text not null check (provider in ('stripe','paypal')),
  provider_subscription_id text,         -- ID en Stripe o PayPal
  provider_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subs_user on public.subscriptions(user_id);
create index if not exists idx_subs_provider_id on public.subscriptions(provider_subscription_id);

-- ---------------------------------------------------------------------
-- PRESUPUESTOS
-- ---------------------------------------------------------------------
create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Datos del cotizante
  cotizante text,
  cliente text,
  lugar text,
  -- Datos del proyecto
  nombre_proyecto text not null,
  fecha date default current_date,
  revision integer default 1,
  moneda text default 'USD',
  -- Porcentajes (override de los del perfil)
  pct_indirectos numeric(6,2) default 10,
  pct_imprevistos numeric(6,2) default 1,
  pct_utilidad numeric(6,2) default 8,
  -- Meta
  estado text default 'borrador' check (estado in ('borrador','enviado','aprobado','rechazado','archivado')),
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_presupuestos_user on public.presupuestos(user_id);

-- ---------------------------------------------------------------------
-- ITEMS DEL PRESUPUESTO (capítulos, sub-capítulos, actividades)
-- Estructura jerárquica auto-referenciada
-- ---------------------------------------------------------------------
create type item_tipo as enum ('capitulo','subcapitulo','actividad');

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  parent_id uuid references public.items(id) on delete cascade,
  tipo item_tipo not null,
  codigo text not null,                  -- '1', '1.1', '1.1.01'
  descripcion text not null,
  unidad text,                            -- solo para actividades
  cantidad numeric(14,4) default 0,       -- solo para actividades
  orden integer default 0,                -- para ordenamiento dentro del padre
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_items_presupuesto on public.items(presupuesto_id);
create index if not exists idx_items_parent on public.items(parent_id);

-- ---------------------------------------------------------------------
-- FICHAS DE COSTO UNITARIO (una por actividad)
-- ---------------------------------------------------------------------
create table if not exists public.fichas_costo (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.items(id) on delete cascade,
  -- Overrides opcionales de % (si null, se usa del presupuesto)
  pct_indirectos numeric(6,2),
  pct_imprevistos numeric(6,2),
  pct_utilidad numeric(6,2),
  -- Cache de cálculos (denormalizado para velocidad — recalcular al actualizar conceptos)
  total_materiales numeric(14,4) default 0,
  total_mano_obra numeric(14,4) default 0,
  total_herramienta_equipo numeric(14,4) default 0,
  total_subcontratos numeric(14,4) default 0,
  costo_directo numeric(14,4) default 0,
  precio_unitario numeric(14,4) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- CONCEPTOS DE LA FICHA DE COSTO
-- ---------------------------------------------------------------------
create type concepto_categoria as enum ('materiales','mano_obra','herramienta_equipo','subcontratos');

create table if not exists public.conceptos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas_costo(id) on delete cascade,
  categoria concepto_categoria not null,
  -- Referencia opcional al catálogo (insumo base)
  insumo_id uuid references public.insumos(id),
  -- Datos del concepto en este momento (snapshot)
  numero integer,
  descripcion text not null,
  unidad text,
  rendimiento numeric(14,6) default 1,
  desperdicio numeric(6,2) default 0,
  costo_unitario numeric(14,4) default 0,
  orden integer default 0
);

create index if not exists idx_conceptos_ficha on public.conceptos(ficha_id);

-- ---------------------------------------------------------------------
-- CATÁLOGO DE INSUMOS (reutilizables por el usuario)
-- ---------------------------------------------------------------------
create table if not exists public.insumos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  categoria concepto_categoria not null,
  codigo text,
  descripcion text not null,
  unidad text not null,
  costo_unitario numeric(14,4) not null default 0,
  proveedor text,
  notas text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_insumos_user on public.insumos(user_id);
create index if not exists idx_insumos_categoria on public.insumos(categoria);

-- ---------------------------------------------------------------------
-- PLANTILLAS DE ACTIVIDADES (catálogo de fichas reutilizables)
-- ---------------------------------------------------------------------
create table if not exists public.plantillas_actividad (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  descripcion text not null,
  unidad text not null,
  ficha_json jsonb not null,             -- snapshot completo de la ficha
  publica boolean default false,
  veces_usada integer default 0,
  created_at timestamptz default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.presupuestos enable row level security;
alter table public.items enable row level security;
alter table public.fichas_costo enable row level security;
alter table public.conceptos enable row level security;
alter table public.insumos enable row level security;
alter table public.plantillas_actividad enable row level security;

-- Profiles: cada usuario ve y edita el suyo
create policy "profile_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profile_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Subscriptions: solo lectura para el usuario, escritura solo por service role (backend)
create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Presupuestos: CRUD del dueño
create policy "presupuestos_all_own" on public.presupuestos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Items: acceso si el presupuesto padre es del usuario
create policy "items_all_own" on public.items
  for all using (
    exists (select 1 from public.presupuestos p
            where p.id = items.presupuesto_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.presupuestos p
            where p.id = items.presupuesto_id and p.user_id = auth.uid())
  );

-- Fichas: acceso si el item padre es del usuario
create policy "fichas_all_own" on public.fichas_costo
  for all using (
    exists (select 1 from public.items i
            join public.presupuestos p on p.id = i.presupuesto_id
            where i.id = fichas_costo.item_id and p.user_id = auth.uid())
  );

-- Conceptos
create policy "conceptos_all_own" on public.conceptos
  for all using (
    exists (select 1 from public.fichas_costo f
            join public.items i on i.id = f.item_id
            join public.presupuestos p on p.id = i.presupuesto_id
            where f.id = conceptos.ficha_id and p.user_id = auth.uid())
  );

-- Insumos: CRUD del dueño
create policy "insumos_all_own" on public.insumos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Plantillas: dueño ve las suyas + todas las públicas; CRUD solo del dueño
create policy "plantillas_select" on public.plantillas_actividad
  for select using (auth.uid() = user_id or publica = true);
create policy "plantillas_modify_own" on public.plantillas_actividad
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Planes: lectura pública (catálogo)
alter table public.planes enable row level security;
create policy "planes_select_all" on public.planes for select using (activo = true);

-- =====================================================================
-- FUNCIONES UTILITARIAS
-- =====================================================================

-- Comprueba si el usuario tiene suscripción activa
create or replace function public.has_active_subscription(uid uuid)
returns boolean as $$
  select exists(
    select 1 from public.subscriptions
    where user_id = uid
      and status in ('trialing','active')
      and (current_period_end is null or current_period_end > now())
  );
$$ language sql stable;

-- Recalcula los totales de una ficha y devuelve el precio unitario
create or replace function public.recalc_ficha(p_ficha_id uuid)
returns numeric as $$
declare
  v_mat numeric := 0; v_mo numeric := 0; v_he numeric := 0; v_sub numeric := 0;
  v_cd numeric; v_ind numeric; v_imp numeric; v_uti numeric; v_pu numeric;
  v_pct_ind numeric; v_pct_imp numeric; v_pct_uti numeric;
begin
  -- Suma cada categoría
  select coalesce(sum(rendimiento * costo_unitario * (1 + desperdicio/100)),0) into v_mat
    from public.conceptos where ficha_id = p_ficha_id and categoria = 'materiales';
  select coalesce(sum(rendimiento * costo_unitario * (1 + desperdicio/100)),0) into v_mo
    from public.conceptos where ficha_id = p_ficha_id and categoria = 'mano_obra';
  select coalesce(sum(rendimiento * costo_unitario * (1 + desperdicio/100)),0) into v_he
    from public.conceptos where ficha_id = p_ficha_id and categoria = 'herramienta_equipo';
  select coalesce(sum(rendimiento * costo_unitario * (1 + desperdicio/100)),0) into v_sub
    from public.conceptos where ficha_id = p_ficha_id and categoria = 'subcontratos';

  -- Obtiene los % (de la ficha si tiene, si no del presupuesto)
  select
    coalesce(f.pct_indirectos, p.pct_indirectos),
    coalesce(f.pct_imprevistos, p.pct_imprevistos),
    coalesce(f.pct_utilidad, p.pct_utilidad)
  into v_pct_ind, v_pct_imp, v_pct_uti
  from public.fichas_costo f
  join public.items i on i.id = f.item_id
  join public.presupuestos p on p.id = i.presupuesto_id
  where f.id = p_ficha_id;

  v_cd := v_mat + v_mo + v_he + v_sub;
  v_ind := v_cd * (v_pct_ind/100);
  v_imp := (v_cd + v_ind) * (v_pct_imp/100);
  v_uti := (v_cd + v_ind) * (v_pct_uti/100);
  v_pu := v_cd + v_ind + v_imp + v_uti;

  update public.fichas_costo set
    total_materiales = v_mat,
    total_mano_obra = v_mo,
    total_herramienta_equipo = v_he,
    total_subcontratos = v_sub,
    costo_directo = v_cd,
    precio_unitario = v_pu,
    updated_at = now()
  where id = p_ficha_id;

  return v_pu;
end;
$$ language plpgsql;
