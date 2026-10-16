-- Ordinary checks keep the input photo and reuse the empty reference.
-- Historical overlay/mask assets and their ownership constraints remain intact.
ALTER TABLE analyses DROP CONSTRAINT analyses_check;
ALTER TABLE analyses ADD CONSTRAINT analyses_check CHECK (
  (outcome = 'Valid' AND classification IS NOT NULL
    AND occupancy_ratio IS NOT NULL AND reference_image_id IS NOT NULL)
  OR (outcome <> 'Valid' AND classification IS NULL AND occupancy_ratio IS NULL)
);
