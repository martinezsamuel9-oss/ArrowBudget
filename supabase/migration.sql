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
