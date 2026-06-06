-- =====================================================================
-- ARROW BUDGET — Migración Multi-usuario v1
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql y migration.sql
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. COLUMNAS ADICIONALES EN PROFILES (por si no existen)
-- -----------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nombre       text,
  ADD COLUMN IF NOT EXISTS empresa      text,
  ADD COLUMN IF NOT EXISTS plan_id_ref  text;   -- referencia al plan activo (denormalizado)

-- Sync: si nombre está vacío pero full_name tiene valor, copiarlo
UPDATE public.profiles SET nombre = full_name
WHERE (nombre IS NULL OR nombre = '') AND full_name IS NOT NULL AND full_name != '';

-- Sync: si empresa está vacío pero company_name tiene valor, copiarlo
UPDATE public.profiles SET empresa = company_name
WHERE (empresa IS NULL OR empresa = '') AND company_name IS NOT NULL AND company_name != '';

-- -----------------------------------------------------------------------
-- 2. PLANES — actualizar con la estructura nueva
-- -----------------------------------------------------------------------
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS max_usuarios integer;

-- Insertar los 3 planes oficiales (upsert seguro)
INSERT INTO public.planes (
  id, nombre, precio_mensual, precio_anual,
  max_proyectos, max_usuarios, features, orden, activo
) VALUES
  ('intermedio', 'Intermedio', 29.99, 299.00, 5, 5,
   '["5 proyectos","5 usuarios","Fichas ilimitadas","Exportación PDF y Excel","Explosión de Insumos","Soporte por email"]'::jsonb, 1, true),
  ('avanzado', 'Avanzado', 59.99, 599.00, 10, 10,
   '["10 proyectos","10 usuarios","Todo Intermedio","Plantillas catálogo","Logo personalizado","Soporte prioritario"]'::jsonb, 2, true),
  ('enterprise', 'Enterprise', 119.99, 1199.00, 40, 20,
   '["40 proyectos","20 usuarios","Todo Avanzado","Acceso API","Onboarding personalizado","SLA 99.9%"]'::jsonb, 3, true)
ON CONFLICT (id) DO UPDATE SET
  nombre         = EXCLUDED.nombre,
  precio_mensual = EXCLUDED.precio_mensual,
  precio_anual   = EXCLUDED.precio_anual,
  max_proyectos  = EXCLUDED.max_proyectos,
  max_usuarios   = EXCLUDED.max_usuarios,
  features       = EXCLUDED.features,
  orden          = EXCLUDED.orden,
  activo         = EXCLUDED.activo;

-- -----------------------------------------------------------------------
-- 3. ENUM DE ROLES
-- -----------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE org_role AS ENUM ('dueno', 'administrador', 'estimador', 'visualizador');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------
-- 4. ORGANIZATIONS — una por empresa/cuenta
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text    NOT NULL,
  logo_url              text,
  created_by            uuid    NOT NULL REFERENCES public.profiles(id),

  -- Stripe
  stripe_customer_id    text    UNIQUE,
  stripe_subscription_id text,

  -- Estado de suscripción
  -- trialing  → período de prueba (no requiere pago)
  -- active    → pagando correctamente
  -- past_due  → pago fallido, inicia período de gracia
  -- grace     → gracia activa (read-only pronto a vencer)
  -- canceled  → cancelado por usuario
  -- inactive  → gracia vencida, solo lectura permanente
  subscription_status   text    DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing','active','past_due','grace','canceled','inactive')),

  plan_id               text    REFERENCES public.planes(id) DEFAULT 'intermedio',
  plan_expires_at       timestamptz,
  grace_until           timestamptz,   -- read-only hasta esta fecha

  -- Límites (cacheados del plan para validaciones rápidas)
  max_usuarios          integer DEFAULT 5,
  max_proyectos         integer DEFAULT 5,

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orgs_created_by      ON public.organizations(created_by);
CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer  ON public.organizations(stripe_customer_id);

-- -----------------------------------------------------------------------
-- 5. ORG_MEMBERS — usuarios dentro de una organización
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        org_role    NOT NULL DEFAULT 'visualizador',
  invited_by  uuid        REFERENCES public.profiles(id),
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org  ON public.org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);

-- -----------------------------------------------------------------------
-- 6. PROJECT_MEMBERS — rol por proyecto (puede diferir del rol en la org)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id  uuid        NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            org_role    NOT NULL,
  assigned_by     uuid        REFERENCES public.profiles(id),
  assigned_at     timestamptz DEFAULT now(),
  UNIQUE(presupuesto_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_presupuesto ON public.project_members(presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user        ON public.project_members(user_id);

-- -----------------------------------------------------------------------
-- 7. INVITATIONS — invitaciones pendientes por correo
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        org_role    NOT NULL DEFAULT 'visualizador',
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid        NOT NULL REFERENCES public.profiles(id),
  accepted_at timestamptz,
  expires_at  timestamptz DEFAULT (now() + INTERVAL '7 days'),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_org   ON public.invitations(org_id);

-- -----------------------------------------------------------------------
-- 8. Agregar org_id a presupuestos
-- -----------------------------------------------------------------------
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_presupuestos_org ON public.presupuestos(org_id);

-- -----------------------------------------------------------------------
-- 9. TRIGGER: al registrarse, crear org + unirse como dueño
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_org_id  uuid;
  v_nombre  text;
BEGIN
  -- Nombre desde metadata
  v_nombre := COALESCE(
    NULLIF(new.raw_user_meta_data->>'full_name', ''),
    NULLIF(new.raw_user_meta_data->>'name', ''),
    SPLIT_PART(new.email, '@', 1)
  );

  -- Crear/actualizar perfil
  INSERT INTO public.profiles (id, email, nombre, full_name)
  VALUES (new.id, new.email, v_nombre, v_nombre)
  ON CONFLICT (id) DO UPDATE SET
    nombre    = COALESCE(NULLIF(EXCLUDED.nombre, ''), profiles.nombre),
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    email     = EXCLUDED.email;

  -- Crear organización
  INSERT INTO public.organizations (nombre, created_by, plan_id, max_usuarios, max_proyectos, subscription_status)
  VALUES (
    COALESCE(
      NULLIF(new.raw_user_meta_data->>'company_name', ''),
      v_nombre || ' Org'
    ),
    new.id,
    'intermedio',
    5,
    5,
    'trialing'
  )
  RETURNING id INTO v_org_id;

  -- Unir al usuario como dueño
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (v_org_id, new.id, 'dueno');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------
-- 10. MIGRAR USUARIOS EXISTENTES — crear org para cada usuario sin org
-- -----------------------------------------------------------------------
DO $$
DECLARE
  r       record;
  v_org_id uuid;
BEGIN
  FOR r IN
    SELECT p.id, p.email, p.nombre, p.full_name, p.company_name, p.empresa
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_members om WHERE om.user_id = p.id
    )
  LOOP
    INSERT INTO public.organizations (
      nombre, created_by, plan_id, max_usuarios, max_proyectos, subscription_status
    )
    VALUES (
      COALESCE(
        NULLIF(r.empresa, ''),
        NULLIF(r.company_name, ''),
        COALESCE(NULLIF(r.nombre, ''), NULLIF(r.full_name, ''), SPLIT_PART(r.email, '@', 1)) || ' Org'
      ),
      r.id,
      'intermedio',
      5,
      5,
      'trialing'
    )
    RETURNING id INTO v_org_id;

    -- Agregar como dueño
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (v_org_id, r.id, 'dueno');

    -- Vincular proyectos existentes a esta org
    UPDATE public.presupuestos
    SET org_id = v_org_id
    WHERE user_id = r.id AND org_id IS NULL;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------
-- 11. FUNCIONES HELPER
-- -----------------------------------------------------------------------

-- Obtener org del usuario actual (la que es dueño)
CREATE OR REPLACE FUNCTION public.get_user_org_id(uid uuid DEFAULT auth.uid())
RETURNS uuid AS $$
  SELECT org_id
  FROM public.org_members
  WHERE user_id = uid AND role = 'dueno'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Obtener el rol del usuario en un proyecto específico
-- Prioridad: rol de proyecto > rol de org (solo si es dueño/admin)
CREATE OR REPLACE FUNCTION public.user_project_role(uid uuid, pid uuid)
RETURNS org_role AS $$
  SELECT COALESCE(
    -- 1. Rol específico en el proyecto
    (SELECT role FROM public.project_members WHERE user_id = uid AND presupuesto_id = pid LIMIT 1),
    -- 2. Rol en la org (solo dueño y admin ven todos los proyectos)
    (SELECT om.role
     FROM public.org_members om
     JOIN public.presupuestos p ON p.org_id = om.org_id
     WHERE om.user_id = uid AND p.id = pid
       AND om.role IN ('dueno', 'administrador')
     LIMIT 1)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿Puede el usuario leer este proyecto?
CREATE OR REPLACE FUNCTION public.can_read_project(uid uuid, pid uuid)
RETURNS boolean AS $$
  SELECT user_project_role(uid, pid) IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿Puede el usuario escribir en este proyecto? (estimador+)
CREATE OR REPLACE FUNCTION public.can_write_project(uid uuid, pid uuid)
RETURNS boolean AS $$
  SELECT user_project_role(uid, pid) IN ('dueno', 'administrador', 'estimador');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿Puede el usuario eliminar en este proyecto? (admin+)
CREATE OR REPLACE FUNCTION public.can_delete_project(uid uuid, pid uuid)
RETURNS boolean AS $$
  SELECT user_project_role(uid, pid) IN ('dueno', 'administrador');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿La org puede agregar más usuarios?
CREATE OR REPLACE FUNCTION public.org_can_add_user(p_org_id uuid)
RETURNS boolean AS $$
  SELECT
    (SELECT COUNT(*) FROM public.org_members WHERE org_id = p_org_id)
    < (SELECT max_usuarios FROM public.organizations WHERE id = p_org_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿La org puede agregar más proyectos?
CREATE OR REPLACE FUNCTION public.org_can_add_project(p_org_id uuid)
RETURNS boolean AS $$
  SELECT
    (SELECT COUNT(*) FROM public.presupuestos WHERE org_id = p_org_id)
    < (SELECT max_proyectos FROM public.organizations WHERE id = p_org_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿La org está en modo activo (no gracia vencida)?
CREATE OR REPLACE FUNCTION public.org_is_active(p_org_id uuid)
RETURNS boolean AS $$
  SELECT subscription_status IN ('trialing', 'active')
      OR (subscription_status IN ('past_due', 'grace') AND grace_until > now())
  FROM public.organizations WHERE id = p_org_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Acepta una invitación: valida token, crea org_member, marca accepted_at
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text, p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_inv record;
BEGIN
  -- Obtener invitación válida
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación inválida o expirada');
  END IF;

  -- Verificar que hay cupo en la org
  IF NOT org_can_add_user(v_inv.org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La organización alcanzó el límite de usuarios');
  END IF;

  -- Agregar usuario a la org
  INSERT INTO public.org_members (org_id, user_id, role, invited_by)
  VALUES (v_inv.org_id, p_user_id, v_inv.role, v_inv.invited_by)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Marcar invitación como aceptada
  UPDATE public.invitations SET accepted_at = now() WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'org_id', v_inv.org_id, 'role', v_inv.role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------
-- 12. RLS — habilitar y crear políticas
-- -----------------------------------------------------------------------

-- ORGANIZATIONS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_member_select"  ON public.organizations;
DROP POLICY IF EXISTS "orgs_owner_update"   ON public.organizations;

CREATE POLICY "orgs_member_select" ON public.organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = id AND om.user_id = auth.uid())
  );
CREATE POLICY "orgs_owner_update" ON public.organizations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = id AND om.user_id = auth.uid() AND om.role = 'dueno')
  );

-- ORG_MEMBERS
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select"       ON public.org_members;
DROP POLICY IF EXISTS "org_members_insert_admin" ON public.org_members;
DROP POLICY IF EXISTS "org_members_update_owner" ON public.org_members;
DROP POLICY IF EXISTS "org_members_delete_owner" ON public.org_members;

CREATE POLICY "org_members_select" ON public.org_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.org_members om2
            WHERE om2.org_id = org_members.org_id AND om2.user_id = auth.uid())
  );
CREATE POLICY "org_members_insert_admin" ON public.org_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = org_members.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('dueno', 'administrador'))
  );
CREATE POLICY "org_members_update_owner" ON public.org_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = org_members.org_id
              AND om.user_id = auth.uid()
              AND om.role = 'dueno')
  );
CREATE POLICY "org_members_delete_owner" ON public.org_members
  FOR DELETE USING (
    user_id != auth.uid() AND  -- no puedes eliminar tu propio acceso
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = org_members.org_id
              AND om.user_id = auth.uid()
              AND om.role = 'dueno')
  );

-- PROJECT_MEMBERS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members_select" ON public.project_members;
DROP POLICY IF EXISTS "project_members_manage"  ON public.project_members;

CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.presupuestos p ON p.org_id = om.org_id
      WHERE p.id = project_members.presupuesto_id
        AND om.user_id = auth.uid()
        AND om.role IN ('dueno', 'administrador')
    )
  );
CREATE POLICY "project_members_manage" ON public.project_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.presupuestos p ON p.org_id = om.org_id
      WHERE p.id = project_members.presupuesto_id
        AND om.user_id = auth.uid()
        AND om.role IN ('dueno', 'administrador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.presupuestos p ON p.org_id = om.org_id
      WHERE p.id = project_members.presupuesto_id
        AND om.user_id = auth.uid()
        AND om.role IN ('dueno', 'administrador')
    )
  );

-- INVITATIONS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select_admin"  ON public.invitations;
DROP POLICY IF EXISTS "invitations_insert_admin"  ON public.invitations;
DROP POLICY IF EXISTS "invitations_delete_admin"  ON public.invitations;
DROP POLICY IF EXISTS "invitations_token_public"  ON public.invitations;

CREATE POLICY "invitations_select_admin" ON public.invitations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = invitations.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('dueno', 'administrador'))
  );
CREATE POLICY "invitations_insert_admin" ON public.invitations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = invitations.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('dueno', 'administrador'))
    AND org_can_add_user(invitations.org_id)
  );
CREATE POLICY "invitations_delete_admin" ON public.invitations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.org_members om
            WHERE om.org_id = invitations.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('dueno', 'administrador'))
  );
-- Lectura pública por token (para pantalla de aceptación de invitación)
CREATE POLICY "invitations_token_public" ON public.invitations
  FOR SELECT USING (accepted_at IS NULL AND expires_at > now());

-- PRESUPUESTOS — reemplazar política única con políticas por operación
DROP POLICY IF EXISTS "presupuestos_all_own"       ON public.presupuestos;
DROP POLICY IF EXISTS "presupuestos_select_member" ON public.presupuestos;
DROP POLICY IF EXISTS "presupuestos_insert_org"    ON public.presupuestos;
DROP POLICY IF EXISTS "presupuestos_update_member" ON public.presupuestos;
DROP POLICY IF EXISTS "presupuestos_delete_owner"  ON public.presupuestos;

CREATE POLICY "presupuestos_select_member" ON public.presupuestos
  FOR SELECT USING (
    user_id = auth.uid()
    OR can_read_project(auth.uid(), id)
  );
CREATE POLICY "presupuestos_insert_org" ON public.presupuestos
  FOR INSERT WITH CHECK (
    -- El insertador debe ser miembro admin+ de la org destino
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = presupuestos.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('dueno', 'administrador')
    )
    -- Y la org no excedió el límite de proyectos
    AND org_can_add_project(presupuestos.org_id)
  );
CREATE POLICY "presupuestos_update_member" ON public.presupuestos
  FOR UPDATE USING (can_write_project(auth.uid(), id));
CREATE POLICY "presupuestos_delete_owner" ON public.presupuestos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = presupuestos.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'dueno'
    )
  );

-- ITEMS — actualizar para incluir acceso de miembros
DROP POLICY IF EXISTS "items_all_own"    ON public.items;
DROP POLICY IF EXISTS "items_select"     ON public.items;
DROP POLICY IF EXISTS "items_write"      ON public.items;

CREATE POLICY "items_select" ON public.items
  FOR SELECT USING (
    can_read_project(auth.uid(), presupuesto_id)
    OR EXISTS (SELECT 1 FROM public.presupuestos p
               WHERE p.id = items.presupuesto_id AND p.user_id = auth.uid())
  );
CREATE POLICY "items_write" ON public.items
  FOR ALL USING (
    can_write_project(auth.uid(), presupuesto_id)
    OR EXISTS (SELECT 1 FROM public.presupuestos p
               WHERE p.id = items.presupuesto_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    can_write_project(auth.uid(), presupuesto_id)
    OR EXISTS (SELECT 1 FROM public.presupuestos p
               WHERE p.id = items.presupuesto_id AND p.user_id = auth.uid())
  );

-- FICHAS DE COSTO — actualizar
DROP POLICY IF EXISTS "fichas_all_own" ON public.fichas_costo;
DROP POLICY IF EXISTS "fichas_select"  ON public.fichas_costo;
DROP POLICY IF EXISTS "fichas_write"   ON public.fichas_costo;

CREATE POLICY "fichas_select" ON public.fichas_costo
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = fichas_costo.item_id
        AND (can_read_project(auth.uid(), i.presupuesto_id)
             OR EXISTS (SELECT 1 FROM public.presupuestos p
                        WHERE p.id = i.presupuesto_id AND p.user_id = auth.uid()))
    )
  );
CREATE POLICY "fichas_write" ON public.fichas_costo
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = fichas_costo.item_id
        AND (can_write_project(auth.uid(), i.presupuesto_id)
             OR EXISTS (SELECT 1 FROM public.presupuestos p
                        WHERE p.id = i.presupuesto_id AND p.user_id = auth.uid()))
    )
  );

-- CONCEPTOS — actualizar
DROP POLICY IF EXISTS "conceptos_all_own" ON public.conceptos;
DROP POLICY IF EXISTS "conceptos_select"  ON public.conceptos;
DROP POLICY IF EXISTS "conceptos_write"   ON public.conceptos;

CREATE POLICY "conceptos_select" ON public.conceptos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.fichas_costo f
      JOIN public.items i ON i.id = f.item_id
      WHERE f.id = conceptos.ficha_id
        AND (can_read_project(auth.uid(), i.presupuesto_id)
             OR EXISTS (SELECT 1 FROM public.presupuestos p
                        WHERE p.id = i.presupuesto_id AND p.user_id = auth.uid()))
    )
  );
CREATE POLICY "conceptos_write" ON public.conceptos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.fichas_costo f
      JOIN public.items i ON i.id = f.item_id
      WHERE f.id = conceptos.ficha_id
        AND (can_write_project(auth.uid(), i.presupuesto_id)
             OR EXISTS (SELECT 1 FROM public.presupuestos p
                        WHERE p.id = i.presupuesto_id AND p.user_id = auth.uid()))
    )
  );

-- INSUMOS — mantener como están (son del catálogo personal del usuario)
-- En el futuro se puede migrar a nivel de org si se requiere catálogo compartido

-- -----------------------------------------------------------------------
-- 13. ÍNDICE DE ROLES (para referencia rápida en frontend)
-- -----------------------------------------------------------------------
-- Tabla de referencia de permisos por rol
-- (solo para documentación, no se usa en RLS directamente)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role          org_role  NOT NULL,
  modulo        text      NOT NULL,
  puede_ver     boolean   DEFAULT false,
  puede_crear   boolean   DEFAULT false,
  puede_editar  boolean   DEFAULT false,
  puede_eliminar boolean  DEFAULT false,
  PRIMARY KEY (role, modulo)
);

INSERT INTO public.role_permissions (role, modulo, puede_ver, puede_crear, puede_editar, puede_eliminar) VALUES
  -- DUEÑO: acceso total
  ('dueno', 'proyectos',    true, true, true, true),
  ('dueno', 'fichas',       true, true, true, true),
  ('dueno', 'catalogos',    true, true, true, true),
  ('dueno', 'exportacion',  true, true, true, true),
  ('dueno', 'equipo',       true, true, true, true),
  ('dueno', 'facturacion',  true, true, true, true),
  -- ADMINISTRADOR
  ('administrador', 'proyectos',   true, true, true, false),
  ('administrador', 'fichas',      true, true, true, true),
  ('administrador', 'catalogos',   true, true, true, true),
  ('administrador', 'exportacion', true, true, true, true),
  ('administrador', 'equipo',      true, true, true, false),
  ('administrador', 'facturacion', false, false, false, false),
  -- ESTIMADOR
  ('estimador', 'proyectos',   true, false, true, false),
  ('estimador', 'fichas',      true, true,  true, false),
  ('estimador', 'catalogos',   true, true,  true, false),
  ('estimador', 'exportacion', true, true,  true, false),
  ('estimador', 'equipo',      false, false, false, false),
  ('estimador', 'facturacion', false, false, false, false),
  -- VISUALIZADOR
  ('visualizador', 'proyectos',   true, false, false, false),
  ('visualizador', 'fichas',      true, false, false, false),
  ('visualizador', 'catalogos',   true, false, false, false),
  ('visualizador', 'exportacion', true, false, false, false),
  ('visualizador', 'equipo',      false, false, false, false),
  ('visualizador', 'facturacion', false, false, false, false)
ON CONFLICT (role, modulo) DO NOTHING;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_public" ON public.role_permissions
  FOR SELECT USING (true);

-- -----------------------------------------------------------------------
-- VERIFICACIÓN FINAL
-- -----------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '=== Multi-user migration complete ===';
  RAISE NOTICE 'Organizations: %', (SELECT COUNT(*) FROM public.organizations);
  RAISE NOTICE 'Org members:   %', (SELECT COUNT(*) FROM public.org_members);
  RAISE NOTICE 'Plans seeded:  %', (SELECT COUNT(*) FROM public.planes WHERE id IN ('intermedio','avanzado','enterprise'));
END;
$$;
