-- Add courier_notes column to sales table to store special instructions sent to courier
ALTER TABLE sales ADD COLUMN IF NOT EXISTS courier_notes TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN sales.courier_notes IS 'Special instructions or notes sent to the courier service';
