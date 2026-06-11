-- =====================================================================
-- ARROW BUDGET — LÍMITES DE PLAN (proyectos por organización)
--
-- Antes: max_proyectos existía en organizations pero NADA lo validaba —
-- se podían crear proyectos infinitos en cualquier plan. Igual con
-- org_is_active(): una suscripción vencida seguía operando completa.
--
-- Ahora:
--   - org_can_add_project(): cuenta proyectos NO archivados vs max_proyectos
--     (archivar un proyecto libera cupo, igual que suspender usuarios)
--   - org_can_add_user(): cuenta solo miembros ACTIVOS (alineado con la
--     Edge Function crear-usuario)
--   - pres_insert exige cupo disponible Y suscripción activa
--     (los proyectos existentes siguen siendo editables siempre)
--
-- Ejecutar DESPUÉS de fixes_criticos_produccion.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funciones de límite robustas (SECURITY DEFINER + search_path)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_can_add_project(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT COUNT(*) FROM presupuestos
          WHERE org_id = p_org_id AND estado <> 'archivado')
       < COALESCE((SELECT max_proyectos FROM organizations WHERE id = p_org_id), 5);
$$;

CREATE OR REPLACE FUNCTION public.org_can_add_user(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT COUNT(*) FROM org_members
          WHERE org_id = p_org_id AND status = 'activo')
       < COALESCE((SELECT max_usuarios FROM organizations WHERE id = p_org_id), 5);
$$;

-- Suscripción activa: trialing/active, o past_due/grace dentro de gracia.
-- Sin estado registrado (NULL) → no bloquear (orgs creadas antes del billing).
CREATE OR REPLACE FUNCTION public.org_is_active(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT subscription_status IS NULL
         OR subscription_status IN ('trialing', 'active')
         OR (subscription_status IN ('past_due', 'grace') AND grace_until > now())
     FROM organizations WHERE id = p_org_id),
    false);
$$;

-- ---------------------------------------------------------------------
-- 2. Enforcement en RLS: crear proyecto exige cupo + suscripción activa.
--    (SELECT/UPDATE/DELETE no cambian: los datos existentes nunca se
--    bloquean — el cliente siempre puede ver y editar lo suyo.)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "pres_insert" ON public.presupuestos;
CREATE POLICY "pres_insert" ON public.presupuestos
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.org_can_add_project(org_id)
    AND public.org_is_active(org_id)
  );

-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
SELECT
  o.nombre,
  o.plan_id,
  o.max_proyectos,
  (SELECT COUNT(*) FROM public.presupuestos p WHERE p.org_id = o.id AND p.estado <> 'archivado') AS proyectos_usados,
  public.org_can_add_project(o.id) AS puede_crear_mas,
  public.org_is_active(o.id)       AS suscripcion_activa
FROM public.organizations o
ORDER BY o.nombre;

DO $$
BEGIN
  RAISE NOTICE '=== limites_plan aplicado ===';
  RAISE NOTICE 'pres_insert exige org_can_add_project() + org_is_active()';
END;
$$;
