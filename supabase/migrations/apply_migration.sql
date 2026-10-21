-- Apply the courier_notes migration
ALTER TABLE sales ADD COLUMN IF NOT EXISTS courier_notes TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN sales.courier_notes IS 'Special instructions or notes sent to the courier service';
