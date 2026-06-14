-- =====================================================================
-- ARROW BUDGET — FASE III · Script 04: BLINDAJE DE APROBACIÓN
--
-- Hallazgo de auditoría (media-alta): las políticas UPDATE de estimaciones,
-- ordenes_cambio y planillas usan can_read_project (a propósito, para que
-- cliente/supervisor/administrador APRUEBEN sin editar el presupuesto). Pero
-- la BD no distingue qué columna se edita → un rol solo-lectura podría, vía
-- la API directa, modificar lineas_json/montos y aprobar en la misma llamada.
--
-- Solución: un trigger BEFORE UPDATE que, si el usuario NO puede escribir el
-- proyecto (can_write_project), SOLO le permite cambiar estado/aprobado_por/
-- updated_at. Cualquier intento de tocar líneas, %s o snapshots → error.
-- Aditivo y seguro.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.solo_aprobacion_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Quien sí puede escribir el proyecto puede editar todo
  IF public.can_write_project(auth.uid(), NEW.presupuesto_id) THEN
    RETURN NEW;
  END IF;
  -- Rol solo-lectura (cliente / administrador_empresa): solo estado/aprobado_por
  IF (NEW.lineas_json IS DISTINCT FROM OLD.lineas_json)
     OR (NEW.pct_retencion IS DISTINCT FROM OLD.pct_retencion)
     OR (NEW.pct_amortizacion IS DISTINCT FROM OLD.pct_amortizacion)
     OR (NEW.subtotal IS DISTINCT FROM OLD.subtotal)
     OR (NEW.neto IS DISTINCT FROM OLD.neto)
     OR (NEW.numero IS DISTINCT FROM OLD.numero)
     OR (NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id) THEN
    RAISE EXCEPTION 'Tu rol solo permite aprobar o rechazar; no modificar montos ni líneas.';
  END IF;
  RETURN NEW;
END;
$$;

-- estimaciones (tiene lineas_json, pct_retencion, pct_amortizacion, subtotal, neto, numero)
DROP TRIGGER IF EXISTS trg_guard_estimaciones ON public.estimaciones;
CREATE TRIGGER trg_guard_estimaciones BEFORE UPDATE ON public.estimaciones
  FOR EACH ROW EXECUTE FUNCTION public.solo_aprobacion_guard();

-- planillas (mismas columnas)
DROP TRIGGER IF EXISTS trg_guard_planillas ON public.planillas;
CREATE TRIGGER trg_guard_planillas BEFORE UPDATE ON public.planillas
  FOR EACH ROW EXECUTE FUNCTION public.solo_aprobacion_guard();

-- ordenes_cambio: no tiene pct_retencion/amortizacion; guard específico
CREATE OR REPLACE FUNCTION public.solo_aprobacion_guard_oc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.can_write_project(auth.uid(), NEW.presupuesto_id) THEN
    RETURN NEW;
  END IF;
  IF (NEW.lineas_json IS DISTINCT FROM OLD.lineas_json)
     OR (NEW.monto IS DISTINCT FROM OLD.monto)
     OR (NEW.numero IS DISTINCT FROM OLD.numero)
     OR (NEW.tipo IS DISTINCT FROM OLD.tipo)
     OR (NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id) THEN
    RAISE EXCEPTION 'Tu rol solo permite aprobar o rechazar; no modificar la orden de cambio.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_ordenes_cambio ON public.ordenes_cambio;
CREATE TRIGGER trg_guard_ordenes_cambio BEFORE UPDATE ON public.ordenes_cambio
  FOR EACH ROW EXECUTE FUNCTION public.solo_aprobacion_guard_oc();

DO $$
BEGIN
  RAISE NOTICE '=== fase3_04_seguridad_aprobacion aplicado ===';
  RAISE NOTICE 'Roles solo-lectura ya no pueden alterar montos/líneas: solo aprobar/rechazar.';
END;
$$;
