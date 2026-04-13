-- Add missing culture phases used by the app UI.
--
-- Notes:
-- - `ALTER TYPE ... ADD VALUE` may be restricted inside a transaction block on some PostgreSQL versions.
-- - Run these statements directly (not wrapped in BEGIN/COMMIT) if your tooling auto-wraps migrations.

ALTER TYPE public.culture_phase ADD VALUE IF NOT EXISTS 'Initiation';
ALTER TYPE public.culture_phase ADD VALUE IF NOT EXISTS 'Acclimatization';

-- Keep trigger behavior consistent with the UI:
-- - Rooting and Acclimatization are treated as terminal phases (no target subculture inventory updates).

CREATE OR REPLACE FUNCTION public.update_inventory_after_operation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_species_id          INT;
  v_mother_subculture   INT;
  v_mother_stock        INT;
  v_new_subculture      INT;
BEGIN
  -- Lock mother inventory row
  SELECT species_id, subculture_mother_jars, number_mother_jar
  INTO v_species_id, v_mother_subculture, v_mother_stock
  FROM inventory
  WHERE id = NEW.inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_id % not found', NEW.inventory_id;
  END IF;

  -- Validate stock
  IF NEW.used_mother_jars > v_mother_stock THEN
    RAISE EXCEPTION 'Used mother jars (%) exceed available stock (%)',
      NEW.used_mother_jars, v_mother_stock;
  END IF;

  -- 1) subtract from mother inventory (always)
  UPDATE inventory
  SET number_mother_jar = number_mother_jar - NEW.used_mother_jars
  WHERE id = NEW.inventory_id;

  -- Terminal phases: ignore creating subculture / adding new jars to inventory
  IF NEW.phase_of_culture IN ('Rooting', 'Acclimatization') THEN
    NEW.subculture_new_jar := NULL;
    RETURN NEW;
  END IF;

  -- 2) compute & enforce new subculture = mother + 1
  v_new_subculture := v_mother_subculture + 1;

  IF NEW.subculture_new_jar IS NULL THEN
    NEW.subculture_new_jar := v_new_subculture;
  ELSIF NEW.subculture_new_jar <> v_new_subculture THEN
    RAISE EXCEPTION 'subculture_new_jar must be mother_subculture+1 (= %). You sent %',
      v_new_subculture, NEW.subculture_new_jar;
  END IF;

  -- 3) add produced jars to target subculture inventory (upsert)
  INSERT INTO inventory (species_id, subculture_mother_jars, number_mother_jar)
  VALUES (v_species_id, v_new_subculture, NEW.number_new_jars)
  ON CONFLICT (species_id, subculture_mother_jars)
  DO UPDATE
  SET number_mother_jar = inventory.number_mother_jar + EXCLUDED.number_mother_jar;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_on_contamination() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_op               RECORD;
  v_species_id        INT;
  v_target_sub        INT;
  v_delta             INT;
  v_target_stock      INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.contaminated_jars;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := NEW.contaminated_jars - OLD.contaminated_jars;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := - OLD.contaminated_jars; -- add back
  END IF;

  -- If delta = 0, nothing to do
  IF v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Load related operation + mother inventory + species
  SELECT
    d.id,
    d.phase_of_culture,
    d.number_new_jars,
    d.subculture_new_jar,
    i.species_id
  INTO v_op
  FROM daily_operations d
  JOIN inventory i ON i.id = d.inventory_id
  WHERE d.id = COALESCE(NEW.operation_id, OLD.operation_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operation % not found', COALESCE(NEW.operation_id, OLD.operation_id);
  END IF;

  -- Terminal phases (no target subculture inventory to adjust)
  IF v_op.phase_of_culture IN ('Rooting', 'Acclimatization') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_species_id := v_op.species_id;
  v_target_sub := v_op.subculture_new_jar;

  IF v_target_sub IS NULL THEN
    -- Should not happen for non-rooting because daily trigger sets it
    RAISE EXCEPTION 'subculture_new_jar is NULL for non-rooting operation %', v_op.id;
  END IF;

  -- Validate contamination not exceeding produced jars for that operation (on INSERT/UPDATE)
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.contaminated_jars > v_op.number_new_jars THEN
      RAISE EXCEPTION 'Contaminated jars (%) cannot exceed produced jars (%) for operation %',
        NEW.contaminated_jars, v_op.number_new_jars, v_op.id;
    END IF;
  END IF;

  -- Lock target inventory row and adjust
  SELECT number_mother_jar
  INTO v_target_stock
  FROM inventory
  WHERE species_id = v_species_id
    AND subculture_mother_jars = v_target_sub
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target inventory not found for species_id % subculture % (operation %)',
      v_species_id, v_target_sub, v_op.id;
  END IF;

  -- Apply delta (subtract if delta positive, add back if negative)
  IF (v_target_stock - v_delta) < 0 THEN
    RAISE EXCEPTION 'Inventory would become negative (current %, delta %)', v_target_stock, v_delta;
  END IF;

  UPDATE inventory
  SET number_mother_jar = number_mother_jar - v_delta
  WHERE species_id = v_species_id
    AND subculture_mother_jars = v_target_sub;

  RETURN COALESCE(NEW, OLD);
END;
$$;
