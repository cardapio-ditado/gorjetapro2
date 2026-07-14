/*
  # Corrigir campo origem em mapeamento_itens_vendas
  
  1. Alterações
    - Permitir NULL na coluna `origem` da tabela `mapeamento_itens_vendas`
    - Origem é um campo opcional que identifica a fonte do mapeamento
    
  2. Motivo
    - Campo está configurado como NOT NULL mas deveria ser opcional
    - Estava causando erro ao salvar mapeamentos sem origem
*/

-- Permitir NULL no campo origem
ALTER TABLE mapeamento_itens_vendas 
  ALTER COLUMN origem DROP NOT NULL;

-- Atualizar registros existentes com origem vazia para NULL
UPDATE mapeamento_itens_vendas 
SET origem = NULL 
WHERE origem = '' OR origem IS NULL;
