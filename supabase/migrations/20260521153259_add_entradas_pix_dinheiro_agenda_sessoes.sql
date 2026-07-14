/*
  # Add entradas_pix and entradas_dinheiro to agenda_sessoes

  Adds two numeric columns to track daily cash and PIX receipts
  in the Agenda Diária session header:

  - `entradas_pix` (numeric, default 0) — PIX received that day
  - `entradas_dinheiro` (numeric, default 0) — Cash received that day
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agenda_sessoes' AND column_name = 'entradas_pix'
  ) THEN
    ALTER TABLE agenda_sessoes ADD COLUMN entradas_pix numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agenda_sessoes' AND column_name = 'entradas_dinheiro'
  ) THEN
    ALTER TABLE agenda_sessoes ADD COLUMN entradas_dinheiro numeric DEFAULT 0;
  END IF;
END $$;
