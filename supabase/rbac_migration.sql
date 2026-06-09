-- =====================================================================
-- ARROW BUDGET — Migración RBAC v1
-- Roles específicos de construcción por proyecto
-- Ejecutar en Supabase SQL Editor DESPUÉS de multiuser_migration.sql
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. ENUM de roles específicos Arrow Budget
-- -----------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE presupuesto_role AS ENUM (
    'gerente',              -- Aprueba presupuestos, envía a ejecución
    'ing_costos_1',         -- Elabora presupuestos, ofertas, estimaciones, órdenes de cambio
    'ing_costos_2',         -- Igual que Ing. Costos I
    'ing_residente',        -- Igual que Ing. Costos I, supervisión en campo
    'supervisor',           -- Aprueba estimaciones, fichas y órdenes de cambio
    'compras',              -- Cotizaciones, listas de materiales, gestión de compras
    'administrador_empresa',-- Aprueba órdenes de compra, visibilidad total (sin crear/aprobar presupuestos)
    'cliente'               -- Aprueba o rechaza presupuesto; vista de supervisor
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------
-- 2. Agregar rol_especifico a project_members
-- -----------------------------------------------------------------------
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS rol_especifico presupuesto_role;

-- -----------------------------------------------------------------------
-- 3. Función: obtener rol específico del usuario en un presupuesto
-- Prioridad: rol_especifico en project_members > rol en org_members
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_project_role(uid uuid, pid uuid)
RETURNS text AS $$
DECLARE
  v_esp  presupuesto_role;
  v_org  org_role;
BEGIN
  -- 1. Rol específico en el proyecto
  SELECT rol_especifico INTO v_esp
  FROM public.project_members
  WHERE user_id = uid AND presupuesto_id = pid
  LIMIT 1;

  IF v_esp IS NOT NULL THEN
    RETURN v_esp::text;
  END IF;

  -- 2. Si es dueño del proyecto, retornar 'gerente'
  IF EXISTS (SELECT 1 FROM public.presupuestos WHERE id = pid AND user_id = uid) THEN
    RETURN 'gerente';
  END IF;

  -- 3. Rol en la org → mapear a rol Arrow
  SELECT om.role INTO v_org
  FROM public.org_members om
  JOIN public.presupuestos p ON p.org_id = om.org_id
  WHERE om.user_id = uid AND p.id = pid
  LIMIT 1;

  CASE v_org
    WHEN 'dueno'        THEN RETURN 'gerente';
    WHEN 'administrador' THEN RETURN 'gerente';
    WHEN 'estimador'    THEN RETURN 'ing_costos_1';
    WHEN 'visualizador' THEN RETURN 'cliente';
    ELSE RETURN NULL;
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------
-- 4. Vista de referencia: miembros del proyecto con nombre + rol
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_project_members AS
SELECT
  pm.presupuesto_id,
  pm.user_id,
  p.nombre        AS nombre,
  p.email         AS email,
  pm.role         AS org_role,
  pm.rol_especifico,
  pm.assigned_at
FROM public.project_members pm
JOIN public.profiles p ON p.id = pm.user_id;

-- -----------------------------------------------------------------------
-- VERIFICACIÓN
-- -----------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '=== RBAC migration complete ===';
  RAISE NOTICE 'presupuesto_role enum created with 8 values';
  RAISE NOTICE 'project_members.rol_especifico column added';
END;
$$;
