-- =====================================================================
-- COTIZANTE — Migración: columnas nuevas para cotizante 2 / Arrow Budget
-- Ejecutar en el SQL Editor de Supabase
-- =====================================================================

-- 1. Nuevas columnas en presupuestos
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS catalogos_json   jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ofertante        text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS realizado_por    text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo             text    DEFAULT 'Residencial',
  ADD COLUMN IF NOT EXISTS logo_ofertante   text,
  ADD COLUMN IF NOT EXISTS logo_cliente     text,
  ADD COLUMN IF NOT EXISTS versiones_json   jsonb   DEFAULT '[]'::jsonb;

-- 2. Ampliar los valores permitidos de 'estado'
--    (el check original sólo tenía: borrador, enviado, aprobado, rechazado, archivado)
ALTER TABLE public.presupuestos
  DROP CONSTRAINT IF EXISTS presupuestos_estado_check;

ALTER TABLE public.presupuestos
  ADD CONSTRAINT presupuestos_estado_check
  CHECK (estado IN (
    'borrador',
    'activo',
    'en_revision',
    'enviado',
    'aprobado',
    'rechazado',
    'archivado'
  ));

-- 3. También añadimos pct_impuesto si aún no existe (de sesiones anteriores)
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS pct_impuesto numeric(6,2) DEFAULT 15;

-- 4. Corregir trigger para guardar full_name al crear perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: actualizar usuarios existentes que tienen full_name en auth pero no en profiles
UPDATE public.profiles p
SET full_name = u.raw_user_meta_data->>'full_name'
FROM auth.users u
WHERE p.id = u.id
  AND (p.full_name IS NULL OR p.full_name = '')
  AND u.raw_user_meta_data->>'full_name' IS NOT NULL
  AND u.raw_user_meta_data->>'full_name' != '';

-- 5. Columnas dedicadas para m² (Bug fix: antes solo se guardaban dentro de catalogos_json)
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS m2_construccion numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS m2_estructura   numeric(12,2) DEFAULT 0;

-- Migrar valores existentes desde catalogos_json._m2c / _m2e a las columnas dedicadas
UPDATE public.presupuestos
SET
  m2_construccion = COALESCE((catalogos_json->>'_m2c')::numeric, 0),
  m2_estructura   = COALESCE((catalogos_json->>'_m2e')::numeric, 0)
WHERE
  m2_construccion = 0
  AND (catalogos_json->>'_m2c') IS NOT NULL
  AND (catalogos_json->>'_m2c')::numeric > 0;

-- 5. Agregar 'en_ejecucion' al constraint de estado (Bug fix: causaba fallo silencioso en auto-save)
ALTER TABLE public.presupuestos
  DROP CONSTRAINT IF EXISTS presupuestos_estado_check;

ALTER TABLE public.presupuestos
  ADD CONSTRAINT presupuestos_estado_check
  CHECK (estado IN (
    'borrador',
    'activo',
    'en_revision',
    'enviado',
    'aprobado',
    'rechazado',
    'archivado',
    'en_ejecucion'
  ));
