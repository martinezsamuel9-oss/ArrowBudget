-- =====================================================================
-- ARROW BUDGET — RESET DEFINITIVO de RLS y ROLES
--
-- Problema encontrado (error 42P17): hay 3 generaciones de políticas
-- acumuladas. Las legacy (pres_update, pres_delete, …) hacen
-- subconsultas directas a org_members, y las políticas de org_members
-- se referencian a sí mismas → recursión infinita → CUALQUIER
-- guardado de presupuestos falla, aunque otra política sí dé permiso.
--
-- Este script:
--   1. Elimina TODAS las políticas de org_members, project_members
--      y presupuestos, y reconstruye un set mínimo y limpio.
--   2. Toda verificación de membresía pasa por funciones
--      SECURITY DEFINER (ignoran RLS → imposible que recursen).
--   3. Migra los datos de los 4 roles viejos a los 8 roles Arrow:
--        dueno → gerente, administrador → gerente,
--        estimador → ing_costos_1, visualizador → cliente
--      y convierte las columnas role al tipo presupuesto_role.
--
-- Ejecutar COMPLETO en el SQL Editor de Supabase. Es idempotente:
-- correrlo dos veces no hace daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Mapeo de roles legacy → Arrow (usado en la migración de datos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_legacy_role(r text)
RETURNS presupuesto_role LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE r
    WHEN 'dueno'         THEN 'gerente'
    WHEN 'administrador' THEN 'gerente'
    WHEN 'estimador'     THEN 'ing_costos_1'
    WHEN 'visualizador'  THEN 'cliente'
    WHEN 'gerente'               THEN 'gerente'
    WHEN 'ing_costos_1'          THEN 'ing_costos_1'
    WHEN 'ing_costos_2'          THEN 'ing_costos_2'
    WHEN 'ing_residente'         THEN 'ing_residente'
    WHEN 'supervisor'            THEN 'supervisor'
    WHEN 'compras'               THEN 'compras'
    WHEN 'administrador_empresa' THEN 'administrador_empresa'
    WHEN 'cliente'               THEN 'cliente'
    ELSE 'cliente'
  END::presupuesto_role;
$$;

-- ---------------------------------------------------------------------
-- 1. DEMOLER: todas las políticas de las 3 tablas conflictivas
--    (la vista se elimina porque bloquea el cambio de tipo de columna)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_project_members;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('org_members', 'project_members', 'presupuestos')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. MIGRAR DATOS: columnas role → tipo presupuesto_role + valores Arrow
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- org_members.role
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='org_members' AND column_name='role')
     <> 'presupuesto_role' THEN
    ALTER TABLE public.org_members ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.org_members ALTER COLUMN role TYPE presupuesto_role
      USING public.map_legacy_role(role::text);
    ALTER TABLE public.org_members ALTER COLUMN role SET DEFAULT 'cliente';
  END IF;

  -- project_members.role
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='project_members' AND column_name='role')
     <> 'presupuesto_role' THEN
    ALTER TABLE public.project_members ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.project_members ALTER COLUMN role TYPE presupuesto_role
      USING public.map_legacy_role(role::text);
    ALTER TABLE public.project_members ALTER COLUMN role SET DEFAULT 'cliente';
  END IF;
END $$;

-- invitations.role — por separado y tolerante: si una política propia
-- de invitations referencia la columna, avisa para tratarlo manual
DO $$
BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='invitations' AND column_name='role')
     <> 'presupuesto_role' THEN
    ALTER TABLE public.invitations ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.invitations ALTER COLUMN role TYPE presupuesto_role
      USING public.map_legacy_role(role::text);
    ALTER TABLE public.invitations ALTER COLUMN role SET DEFAULT 'cliente';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'invitations.role no se pudo convertir automáticamente: % — revisar manualmente', SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- 3. FUNCIONES SECURITY DEFINER (ignoran RLS → cero recursión)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.i_am_gerente()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND role::text = 'gerente'
  );
$$;

-- Rol efectivo de un usuario en un proyecto (Arrow):
-- rol_especifico del proyecto > dueño (= gerente) > rol en la org
CREATE OR REPLACE FUNCTION public.get_project_role(uid uuid, pid uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_esp text;
  v_org text;
BEGIN
  SELECT rol_especifico::text INTO v_esp
  FROM project_members WHERE user_id = uid AND presupuesto_id = pid LIMIT 1;
  IF v_esp IS NOT NULL THEN RETURN v_esp; END IF;

  IF EXISTS (SELECT 1 FROM presupuestos WHERE id = pid AND user_id = uid) THEN
    RETURN 'gerente';
  END IF;

  SELECT om.role::text INTO v_org
  FROM org_members om
  JOIN presupuestos p ON p.org_id = om.org_id
  WHERE om.user_id = uid AND p.id = pid
  LIMIT 1;
  RETURN public.map_legacy_role(v_org)::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_project(uid uuid, pid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM presupuestos WHERE id = pid AND user_id = uid)
      OR public.get_project_role(uid, pid) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(uid uuid, pid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM presupuestos WHERE id = pid AND user_id = uid)
      OR public.get_project_role(uid, pid) IN
         ('gerente','ing_costos_1','ing_costos_2','ing_residente','supervisor','compras');
$$;

CREATE OR REPLACE FUNCTION public.can_delete_project(uid uuid, pid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM presupuestos WHERE id = pid AND user_id = uid)
      OR public.get_project_role(uid, pid) = 'gerente';
$$;

-- Función legacy que devolvía org_role: fuera (con sus dependencias)
DROP FUNCTION IF EXISTS public.user_project_role(uuid, uuid) CASCADE;

-- ---------------------------------------------------------------------
-- 4. RECONSTRUIR POLÍTICAS — set mínimo, solo funciones + columnas
-- ---------------------------------------------------------------------

-- ===== org_members =====
CREATE POLICY "om_select" ON public.org_members
  FOR SELECT USING (user_id = auth.uid() OR org_id = public.get_my_org_id());

-- insert: auto-seed propio (comportamiento actual de la app) o gerente agregando gente a su org
CREATE POLICY "om_insert" ON public.org_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR (public.i_am_gerente() AND org_id = public.get_my_org_id())
  );

CREATE POLICY "om_update" ON public.org_members
  FOR UPDATE
  USING      (public.i_am_gerente() AND org_id = public.get_my_org_id())
  WITH CHECK (org_id = public.get_my_org_id());

CREATE POLICY "om_delete" ON public.org_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR (public.i_am_gerente() AND org_id = public.get_my_org_id())
  );

-- ===== project_members =====
CREATE POLICY "pm_select" ON public.project_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_read_project(auth.uid(), presupuesto_id)
  );

CREATE POLICY "pm_insert" ON public.project_members
  FOR INSERT WITH CHECK (public.get_project_role(auth.uid(), presupuesto_id) = 'gerente');

CREATE POLICY "pm_update" ON public.project_members
  FOR UPDATE
  USING      (public.get_project_role(auth.uid(), presupuesto_id) = 'gerente')
  WITH CHECK (public.get_project_role(auth.uid(), presupuesto_id) = 'gerente');

CREATE POLICY "pm_delete" ON public.project_members
  FOR DELETE USING (public.get_project_role(auth.uid(), presupuesto_id) = 'gerente');

-- ===== presupuestos =====
CREATE POLICY "pres_select" ON public.presupuestos
  FOR SELECT USING (user_id = auth.uid() OR public.can_read_project(auth.uid(), id));

CREATE POLICY "pres_insert" ON public.presupuestos
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "pres_update" ON public.presupuestos
  FOR UPDATE
  USING      (user_id = auth.uid() OR public.can_write_project(auth.uid(), id))
  WITH CHECK (user_id = auth.uid() OR public.can_write_project(auth.uid(), id));

CREATE POLICY "pres_delete" ON public.presupuestos
  FOR DELETE USING (user_id = auth.uid() OR public.can_delete_project(auth.uid(), id));

-- ---------------------------------------------------------------------
-- 5. Recrear la vista de referencia
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_project_members AS
SELECT
  pm.presupuesto_id,
  pm.user_id,
  p.nombre,
  p.email,
  pm.role           AS org_role,
  pm.rol_especifico,
  pm.assigned_at
FROM public.project_members pm
JOIN public.profiles p ON p.id = pm.user_id;

-- ---------------------------------------------------------------------
-- 6. VERIFICACIÓN — los resultados de estas consultas deben verse así:
--    a) solo las políticas om_*, pm_*, pres_* (4 por tabla)
--    b) todos los roles son de los 8 Arrow (ningún dueno/estimador/…)
-- ---------------------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('org_members', 'project_members', 'presupuestos')
ORDER BY tablename, cmd, policyname;

SELECT 'org_members' AS tabla, role::text, count(*) FROM public.org_members GROUP BY 2
UNION ALL
SELECT 'project_members', role::text, count(*) FROM public.project_members GROUP BY 2
ORDER BY 1, 2;

DO $$
BEGIN
  RAISE NOTICE '=== RESET DEFINITIVO aplicado ===';
  RAISE NOTICE 'Políticas limpias en org_members / project_members / presupuestos';
  RAISE NOTICE 'Roles migrados a los 8 Arrow; verificación arriba.';
END;
$$;
