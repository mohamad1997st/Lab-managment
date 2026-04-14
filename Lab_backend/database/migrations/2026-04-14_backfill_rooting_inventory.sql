-- One-time backfill for Rooting inventory buckets.
-- Rebuild phase='Rooting' inventory (subculture 0) from historical
-- daily_operations and contamination_records.

WITH rooting_history AS (
  SELECT
    t.lab_id,
    t.species_id,
    GREATEST(SUM(t.produced_jars) - SUM(t.contaminated_jars), 0)::int AS rooting_qty
  FROM (
    SELECT
      i.lab_id,
      i.species_id,
      d.number_new_jars::int AS produced_jars,
      0::int AS contaminated_jars
    FROM public.daily_operations d
    JOIN public.inventory i ON i.id = d.inventory_id
    WHERE d.phase_of_culture = 'Rooting'

    UNION ALL

    SELECT
      i.lab_id,
      i.species_id,
      0::int AS produced_jars,
      c.contaminated_jars::int AS contaminated_jars
    FROM public.contamination_records c
    JOIN public.daily_operations d ON d.id = c.operation_id
    JOIN public.inventory i ON i.id = d.inventory_id
    WHERE d.phase_of_culture = 'Rooting'
  ) AS t
  GROUP BY t.lab_id, t.species_id
),
upserted AS (
  INSERT INTO public.inventory (
    lab_id,
    species_id,
    phase_of_culture,
    subculture_mother_jars,
    number_mother_jar
  )
  SELECT
    rh.lab_id,
    rh.species_id,
    'Rooting'::public.culture_phase,
    0,
    rh.rooting_qty
  FROM rooting_history rh
  WHERE rh.rooting_qty > 0
  ON CONFLICT (lab_id, species_id, phase_of_culture, subculture_mother_jars)
  DO UPDATE
  SET number_mother_jar = EXCLUDED.number_mother_jar
  RETURNING lab_id, species_id
)
DELETE FROM public.inventory i
WHERE i.phase_of_culture = 'Rooting'
  AND i.subculture_mother_jars = 0
  AND NOT EXISTS (
    SELECT 1
    FROM rooting_history rh
    WHERE rh.lab_id = i.lab_id
      AND rh.species_id = i.species_id
      AND rh.rooting_qty > 0
  );
