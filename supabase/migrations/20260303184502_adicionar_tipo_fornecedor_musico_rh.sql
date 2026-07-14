/*
  # Adicionar Tipo de Fornecedor (Músico/RH/Geral)

  1. Alterações
    - Adiciona coluna `tipo` em `fornecedores`
      - Valores possíveis: 'musico', 'rh', 'geral' (padrão)
      - Permite filtrar fornecedores por contexto de uso
    
  2. Objetivo
    - Fornecedores marcados como 'musico' aparecem apenas na aba Músicos
    - Fornecedores marcados como 'rh' aparecem apenas na aba RH
    - Fornecedores 'geral' aparecem em todos os contextos
  
  3. Notas
    - Não remove dados existentes
    - Define 'geral' como padrão para fornecedores já cadastrados
*/

-- Adicionar coluna tipo à tabela fornecedores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fornecedores' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE fornecedores 
    ADD COLUMN tipo text DEFAULT 'geral' CHECK (tipo IN ('musico', 'rh', 'geral'));
  END IF;
END $$;

-- Criar índice para melhorar performance em filtros
CREATE INDEX IF NOT EXISTS idx_fornecedores_tipo ON fornecedores(tipo);

-- Atualizar fornecedores existentes que tem palavras-chave relacionadas a música
UPDATE fornecedores
SET tipo = 'musico'
WHERE tipo = 'geral'
  AND (
    LOWER(nome) LIKE '%música%' OR
    LOWER(nome) LIKE '%artista%' OR
    LOWER(nome) LIKE '%banda%' OR
    LOWER(nome) LIKE '%cantor%' OR
    LOWER(nome) LIKE '%músico%' OR
    LOWER(nome) LIKE '%dj%'
  );

-- Atualizar fornecedores existentes que tem palavras-chave relacionadas a RH
UPDATE fornecedores
SET tipo = 'rh'
WHERE tipo = 'geral'
  AND (
    LOWER(nome) LIKE '%rh%' OR
    LOWER(nome) LIKE '%funcionário%' OR
    LOWER(nome) LIKE '%colaborador%' OR
    LOWER(nome) LIKE '%pagamento%funcionário%' OR
    LOWER(nome) LIKE '%pagamento%colaborador%'
  );