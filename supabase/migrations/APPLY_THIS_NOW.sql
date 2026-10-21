-- CRITICAL: Apply this migration immediately!
-- This adds the courier_notes column that the app is trying to update

ALTER TABLE sales ADD COLUMN IF NOT EXISTS courier_notes TEXT;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sales' 
AND column_name = 'courier_notes';
