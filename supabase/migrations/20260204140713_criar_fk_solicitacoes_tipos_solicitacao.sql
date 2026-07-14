/*
  # Criar Foreign Key entre solicitacoes e tipos_solicitacao
  
  ## Problema
  - Não existe relacionamento entre as tabelas solicitacoes e tipos_solicitacao
  - Consultas com join falham
  
  ## Solução
  - Criar foreign key constraint entre as tabelas
*/

-- Adicionar foreign key se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'solicitacoes_tipo_solicitacao_id_fkey'
    AND table_name = 'solicitacoes'
  ) THEN
    ALTER TABLE solicitacoes
    ADD CONSTRAINT solicitacoes_tipo_solicitacao_id_fkey
    FOREIGN KEY (tipo_solicitacao_id)
    REFERENCES tipos_solicitacao(id)
    ON DELETE SET NULL;
  END IF;
END $$;
