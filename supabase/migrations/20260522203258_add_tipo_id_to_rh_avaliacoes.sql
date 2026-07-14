/*
  # Adicionar tipo_id em rh_avaliacoes

  Referência para a tabela rh_avaliacao_tipos, permitindo vincular a avaliação
  ao tipo configurado e recuperar seus critérios.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_avaliacoes' AND column_name = 'tipo_id'
  ) THEN
    ALTER TABLE rh_avaliacoes ADD COLUMN tipo_id uuid REFERENCES rh_avaliacao_tipos(id) ON DELETE SET NULL;
  END IF;
END $$;
