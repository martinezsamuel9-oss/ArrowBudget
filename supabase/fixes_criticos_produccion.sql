-- =====================================================================
-- ARROW BUDGET — 4 FIXES CRÍTICOS pre-producción
-- Ejecutar DESPUÉS de modulo_usuarios.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. get_user_org_id() seguía filtrando por el rol legacy 'dueno'
--    → devolvía NULL/error y rompía "Nuevo Proyecto" y "Clonar".
--    Ahora: la org donde el usuario es miembro ACTIVO (prioriza gerente).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_org_id(uid uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM org_members
  WHERE user_id = uid AND status = 'activo'
  ORDER BY (role::text = 'gerente') DESC
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 2. profiles: los miembros de una org pueden leer nombre/correo
--    de sus compañeros (la página Equipo lo necesita).
--    La política existente profile_select_own (solo el propio) se queda.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "profile_select_orgmates" ON public.profiles;
CREATE POLICY "profile_select_orgmates" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = profiles.id
        AND om.org_id = public.get_my_org_id()
    )
  );

-- ---------------------------------------------------------------------
-- 3. Cerrar agujero: om_insert permitía a cualquier usuario insertarse
--    a sí mismo en CUALQUIER organización (solo necesitaba el UUID).
--    Ahora el auto-seed solo aplica en orgs creadas por el propio usuario.
--    (accept_invitation es SECURITY DEFINER, no depende de esta política.)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "om_insert" ON public.org_members;
CREATE POLICY "om_insert" ON public.org_members
  FOR INSERT WITH CHECK (
    (user_id = auth.uid() AND EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = org_id AND o.created_by = auth.uid()))
    OR (public.i_am_gerente() AND org_id = public.get_my_org_id())
  );

-- ---------------------------------------------------------------------
-- 4. Visibilidad de proyectos para invitados + rol por proyecto
--    a) organizations: la política de UPDATE comparaba rol legacy 'dueno'
--       (error de enum en runtime) → ahora gerente.
--    b) get_project_role: el fallback por rol de org ahora solo aplica a
--       gerente y administrador_empresa (visibilidad total). Los demás
--       roles ven únicamente los proyectos donde fueron asignados
--       (project_members) — como define el modelo Arrow.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "orgs_owner_update" ON public.organizations;
CREATE POLICY "orgs_owner_update" ON public.organizations
  FOR UPDATE
  USING      (public.i_am_gerente() AND id = public.get_my_org_id())
  WITH CHECK (id = public.get_my_org_id());

CREATE OR REPLACE FUNCTION public.get_project_role(uid uuid, pid uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_esp text;
  v_org text;
BEGIN
  -- Suspendido en la org del proyecto → sin acceso por rol
  IF EXISTS (
    SELECT 1 FROM org_members om
    JOIN presupuestos p ON p.org_id = om.org_id
    WHERE om.user_id = uid AND p.id = pid AND om.status = 'suspendido'
  ) THEN
    RETURN NULL;
  END IF;

  -- 1. Rol específico asignado en el proyecto
  SELECT rol_especifico::text INTO v_esp
  FROM project_members WHERE user_id = uid AND presupuesto_id = pid LIMIT 1;
  IF v_esp IS NOT NULL THEN RETURN v_esp; END IF;

  -- 2. Dueño del proyecto → gerente
  IF EXISTS (SELECT 1 FROM presupuestos WHERE id = pid AND user_id = uid) THEN
    RETURN 'gerente';
  END IF;

  -- 3. Rol de org — solo gerente y administrador tienen visibilidad total
  SELECT om.role::text INTO v_org
  FROM org_members om
  JOIN presupuestos p ON p.org_id = om.org_id
  WHERE om.user_id = uid AND p.id = pid
  LIMIT 1;

  IF v_org IS NULL THEN RETURN NULL; END IF;
  v_org := public.map_legacy_role(v_org)::text;
  IF v_org IN ('gerente', 'administrador_empresa') THEN RETURN v_org; END IF;
  RETURN NULL;  -- los demás roles requieren asignación explícita al proyecto
END;
$$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
SELECT 'get_user_org_id' AS chk, public.get_user_org_id('00000000-0000-0000-0000-000000000000'::uuid) IS NULL AS ok_null_para_desconocido;

SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('profiles','org_members','organizations')
ORDER BY tablename, policyname;

DO $$
BEGIN
  RAISE NOTICE '=== fixes críticos aplicados ===';
  RAISE NOTICE '1) get_user_org_id sin rol legacy  2) perfiles visibles entre compañeros';
  RAISE NOTICE '3) om_insert cerrado  4) organizations + visibilidad por asignación';
END;
$$;
