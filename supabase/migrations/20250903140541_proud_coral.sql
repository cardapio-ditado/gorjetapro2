/*
  # Add horario columns to musicos table

  1. New Columns
    - `horario_inicio` (time) - Start time of the musical presentation
    - `horario_fim` (time) - End time of the musical presentation

  2. Changes
    - Add horario_inicio column to musicos table
    - Add horario_fim column to musicos table
    - Both columns are optional (nullable)
*/

-- Add horario_inicio column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'horario_inicio'
  ) THEN
    ALTER TABLE musicos ADD COLUMN horario_inicio time;
  END IF;
END $$;

-- Add horario_fim column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'horario_fim'
  ) THEN
    ALTER TABLE musicos ADD COLUMN horario_fim time;
  END IF;
END $$;