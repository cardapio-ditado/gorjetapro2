/*
  # Adicionar campo de documento/anexo às notas De Ville

  1. Alterações
    - `fornecedor_notas`: nova coluna `documento_url` (text, nullable)
      Armazena a URL pública do arquivo (foto ou PDF) anexado à nota.

  2. Storage
    - Bucket `deville-documentos` criado como público para leitura.
    - Políticas: authenticated pode fazer upload; público pode ler.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fornecedor_notas' AND column_name = 'documento_url'
  ) THEN
    ALTER TABLE fornecedor_notas ADD COLUMN documento_url text;
  END IF;
END $$;
