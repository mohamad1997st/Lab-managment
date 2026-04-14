-- Enforce source -> target phase movement rules for inventory-consuming operations.
-- Initiation inventory is created manually and can only move into Multiplication.
-- Multiplication can stay in Multiplication or move into Rooting.
-- Rooting can only move into Acclimatization and does not create new inventory.

CREATE OR REPLACE FUNCTION public.update_inventory_after_operation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_species_id          INT;
  v_lab_id              INT;
  v_source_phase        public.culture_phase;
  v_mother_subculture   INT;
  v_mother_stock        INT;
  v_new_subculture      INT;
BEGIN
  SELECT lab_id, species_id, phase_of_culture, subculture_mother_jars, number_mother_jar
  INTO v_lab_id, v_species_id, v_source_phase, v_mother_subculture, v_mother_stock
  FROM inventory
  WHERE id = NEW.inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_id % not found', NEW.inventory_id;
  END IF;

  IF NEW.used_mother_jars > v_mother_stock THEN
    RAISE EXCEPTION 'Used mother jars (%) exceed available stock (%)',
      NEW.used_mother_jars, v_mother_stock;
  END IF;

  IF v_source_phase = 'Initiation' AND NEW.phase_of_culture <> 'Multiplication' THEN
    RAISE EXCEPTION 'Initiation inventory can only move to Multiplication';
  ELSIF v_source_phase = 'Multiplication' AND NEW.phase_of_culture NOT IN ('Multiplication', 'Rooting') THEN
    RAISE EXCEPTION 'Multiplication inventory can only move to Multiplication or Rooting';
  ELSIF v_source_phase = 'Rooting' AND NEW.phase_of_culture <> 'Acclimatization' THEN
    RAISE EXCEPTION 'Rooting inventory can only move to Acclimatization';
  ELSIF v_source_phase NOT IN ('Initiation', 'Multiplication', 'Rooting') THEN
    RAISE EXCEPTION 'Inventory phase % cannot be used as an operation source', v_source_phase;
  END IF;

  UPDATE inventory
  SET number_mother_jar = number_mother_jar - NEW.used_mother_jars
  WHERE id = NEW.inventory_id;

  IF NEW.phase_of_culture = 'Acclimatization' THEN
    NEW.subculture_new_jar := NULL;
    RETURN NEW;
  END IF;

  IF NEW.phase_of_culture = 'Rooting' THEN
    NEW.subculture_new_jar := NULL;

    INSERT INTO inventory (lab_id, species_id, phase_of_culture, subculture_mother_jars, number_mother_jar)
    VALUES (v_lab_id, v_species_id, 'Rooting', 0, NEW.number_new_jars)
    ON CONFLICT (lab_id, species_id, phase_of_culture, subculture_mother_jars)
    DO UPDATE
    SET number_mother_jar = inventory.number_mother_jar + EXCLUDED.number_mother_jar;

    RETURN NEW;
  END IF;

  IF NEW.phase_of_culture <> 'Multiplication' THEN
    RAISE EXCEPTION 'Unsupported target phase %', NEW.phase_of_culture;
  END IF;

  v_new_subculture := CASE
    WHEN v_source_phase = 'Initiation' THEN 1
    ELSE v_mother_subculture + 1
  END;

  IF NEW.subculture_new_jar IS NULL THEN
    NEW.subculture_new_jar := v_new_subculture;
  ELSIF NEW.subculture_new_jar <> v_new_subculture THEN
    RAISE EXCEPTION 'subculture_new_jar must be % for this operation. You sent %',
      v_new_subculture, NEW.subculture_new_jar;
  END IF;

  INSERT INTO inventory (lab_id, species_id, phase_of_culture, subculture_mother_jars, number_mother_jar)
  VALUES (v_lab_id, v_species_id, 'Multiplication', v_new_subculture, NEW.number_new_jars)
  ON CONFLICT (lab_id, species_id, phase_of_culture, subculture_mother_jars)
  DO UPDATE
  SET number_mother_jar = inventory.number_mother_jar + EXCLUDED.number_mother_jar;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_on_contamination() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_op                RECORD;
  v_lab_id            INT;
  v_species_id        INT;
  v_target_phase      public.culture_phase;
  v_target_sub        INT;
  v_delta             INT;
  v_target_stock      INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.contaminated_jars;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := NEW.contaminated_jars - OLD.contaminated_jars;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := - OLD.contaminated_jars;
  END IF;

  IF v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    d.id,
    d.phase_of_culture,
    d.number_new_jars,
    d.subculture_new_jar,
    i.lab_id,
    i.species_id
  INTO v_op
  FROM daily_operations d
  JOIN inventory i ON i.id = d.inventory_id
  WHERE d.id = COALESCE(NEW.operation_id, OLD.operation_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operation % not found', COALESCE(NEW.operation_id, OLD.operation_id);
  END IF;

  IF v_op.phase_of_culture = 'Acclimatization' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_lab_id := v_op.lab_id;
  v_species_id := v_op.species_id;

  IF v_op.phase_of_culture = 'Rooting' THEN
    v_target_phase := 'Rooting';
    v_target_sub := 0;
  ELSIF v_op.phase_of_culture = 'Multiplication' THEN
    v_target_phase := 'Multiplication';
    v_target_sub := v_op.subculture_new_jar;

    IF v_target_sub IS NULL THEN
      RAISE EXCEPTION 'subculture_new_jar is NULL for multiplication operation %', v_op.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported operation phase % for contamination inventory adjustment', v_op.phase_of_culture;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.contaminated_jars > v_op.number_new_jars THEN
      RAISE EXCEPTION 'Contaminated jars (%) cannot exceed produced jars (%) for operation %',
        NEW.contaminated_jars, v_op.number_new_jars, v_op.id;
    END IF;
  END IF;

  SELECT number_mother_jar
  INTO v_target_stock
  FROM inventory
  WHERE lab_id = v_lab_id
    AND species_id = v_species_id
    AND phase_of_culture = v_target_phase
    AND subculture_mother_jars = v_target_sub
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target inventory not found for species_id %, phase %, subculture % (operation %)',
      v_species_id, v_target_phase, v_target_sub, v_op.id;
  END IF;

  IF (v_target_stock - v_delta) < 0 THEN
    RAISE EXCEPTION 'Inventory would become negative (current %, delta %)', v_target_stock, v_delta;
  END IF;

  UPDATE inventory
  SET number_mother_jar = number_mother_jar - v_delta
  WHERE lab_id = v_lab_id
    AND species_id = v_species_id
    AND phase_of_culture = v_target_phase
    AND subculture_mother_jars = v_target_sub;

  RETURN COALESCE(NEW, OLD);
END;
$$;
