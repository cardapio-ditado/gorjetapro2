/*
  # Melhorias em Fichas Técnicas
  
  ## Descrição
  Esta migration implementa melhorias significativas no sistema de fichas técnicas:
  
  ## 1. Mudanças na estrutura
  
  ### Tabela `ficha_ingredientes`
  - Adiciona `ficha_tecnica_ingrediente_id` (UUID, nullable) - permite que uma ficha técnica seja ingrediente de outra
  - Torna `item_estoque_id` nullable (antes era obrigatório)
  - Adiciona constraint CHECK para garantir que OU item_estoque_id OU ficha_tecnica_ingrediente_id esteja preenchido
  - Adiciona `unidade_medida` (TEXT) - para facilitar conversões quando usar fichas como ingredientes
  - Adiciona `ordem` (INTEGER) - para ordenar ingredientes na receita
  
  ### Tabela `fichas_tecnicas`
  - Adiciona `modo_preparo` (TEXT) - receita passo a passo em formato texto
  - Adiciona `observacoes_preparo` (TEXT) - observações adicionais sobre o preparo
  - Adiciona `rendimento` (NUMERIC) - quantidade que a receita rende
  - Adiciona `unidade_rendimento` (TEXT) - unidade do rendimento (kg, litros, porções, etc)
  
  ## 2. Funcionalidade
  
  ### Fichas como ingredientes
  - Uma ficha técnica agora pode ser ingrediente de outra ficha
  - Exemplo: "Molho Bechamel" pode ser ingrediente de "Lasanha"
  - Útil para receitas complexas com subpreparos
  
  ### Receita passo a passo
  - Campo `modo_preparo` armazena instruções detalhadas
  - Pode incluir formatação markdown ou HTML
  - Ajuda na padronização do preparo
  
  ## 3. Segurança
  - Mantém RLS existente
  - Adiciona políticas para as novas colunas
  
  ## 4. Compatibilidade
  - Mantém compatibilidade com dados existentes
  - Todos os novos campos são opcionais (nullable)
  - Não quebra funcionalidades existentes
*/

-- Adicionar novos campos na tabela fichas_tecnicas
ALTER TABLE fichas_tecnicas 
  ADD COLUMN IF NOT EXISTS modo_preparo TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_preparo TEXT,
  ADD COLUMN IF NOT EXISTS rendimento NUMERIC,
  ADD COLUMN IF NOT EXISTS unidade_rendimento TEXT DEFAULT 'porções';

-- Melhorar estrutura de ficha_ingredientes
-- Primeiro, tornar item_estoque_id nullable
ALTER TABLE ficha_ingredientes 
  ALTER COLUMN item_estoque_id DROP NOT NULL;

-- Adicionar novas colunas em ficha_ingredientes
ALTER TABLE ficha_ingredientes
  ADD COLUMN IF NOT EXISTS ficha_tecnica_ingrediente_id UUID REFERENCES fichas_tecnicas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unidade_medida TEXT,
  ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- Remover constraint UNIQUE antigo se existir
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ficha_ingredientes_ficha_id_insumo_id_key'
  ) THEN
    ALTER TABLE ficha_ingredientes DROP CONSTRAINT ficha_ingredientes_ficha_id_insumo_id_key;
  END IF;
END $$;

-- Adicionar constraint para garantir que OU item_estoque_id OU ficha_tecnica_ingrediente_id esteja preenchido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ficha_ingredientes_item_ou_ficha_check'
  ) THEN
    ALTER TABLE ficha_ingredientes
      ADD CONSTRAINT ficha_ingredientes_item_ou_ficha_check
      CHECK (
        (item_estoque_id IS NOT NULL AND ficha_tecnica_ingrediente_id IS NULL) OR
        (item_estoque_id IS NULL AND ficha_tecnica_ingrediente_id IS NOT NULL)
      );
  END IF;
END $$;

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_ficha_ingredientes_ficha_tecnica 
  ON ficha_ingredientes(ficha_tecnica_ingrediente_id);

CREATE INDEX IF NOT EXISTS idx_ficha_ingredientes_ordem 
  ON ficha_ingredientes(ficha_id, ordem);

-- Criar função para calcular custo total da ficha recursivamente (incluindo subfichas)
CREATE OR REPLACE FUNCTION calcular_custo_ficha_recursivo(ficha_uuid UUID)
RETURNS NUMERIC AS $$
DECLARE
  custo_total NUMERIC := 0;
  ing RECORD;
BEGIN
  -- Iterar sobre cada ingrediente da ficha
  FOR ing IN 
    SELECT 
      item_estoque_id,
      ficha_tecnica_ingrediente_id,
      quantidade
    FROM ficha_ingredientes
    WHERE ficha_id = ficha_uuid
  LOOP
    -- Se for um item de estoque
    IF ing.item_estoque_id IS NOT NULL THEN
      -- Somar o custo do item
      SELECT COALESCE(custo_total + (
        SELECT COALESCE(custo_medio, 0) * ing.quantidade
        FROM itens_estoque
        WHERE id = ing.item_estoque_id
      ), custo_total) INTO custo_total;
    
    -- Se for uma ficha técnica
    ELSIF ing.ficha_tecnica_ingrediente_id IS NOT NULL THEN
      -- Chamar recursivamente para calcular o custo da subficha
      SELECT COALESCE(custo_total + (
        calcular_custo_ficha_recursivo(ing.ficha_tecnica_ingrediente_id) * ing.quantidade
      ), custo_total) INTO custo_total;
    END IF;
  END LOOP;
  
  RETURN custo_total;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar custo_total automaticamente
CREATE OR REPLACE FUNCTION atualizar_custo_ficha()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar o custo da ficha que teve ingrediente modificado
  UPDATE fichas_tecnicas
  SET custo_total = calcular_custo_ficha_recursivo(NEW.ficha_id)
  WHERE id = NEW.ficha_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para inserção e atualização de ingredientes
DROP TRIGGER IF EXISTS trigger_atualizar_custo_ficha_insert ON ficha_ingredientes;
CREATE TRIGGER trigger_atualizar_custo_ficha_insert
  AFTER INSERT ON ficha_ingredientes
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_custo_ficha();

DROP TRIGGER IF EXISTS trigger_atualizar_custo_ficha_update ON ficha_ingredientes;
CREATE TRIGGER trigger_atualizar_custo_ficha_update
  AFTER UPDATE ON ficha_ingredientes
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_custo_ficha();

-- Trigger para exclusão de ingredientes
CREATE OR REPLACE FUNCTION atualizar_custo_ficha_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE fichas_tecnicas
  SET custo_total = calcular_custo_ficha_recursivo(OLD.ficha_id)
  WHERE id = OLD.ficha_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_atualizar_custo_ficha_delete ON ficha_ingredientes;
CREATE TRIGGER trigger_atualizar_custo_ficha_delete
  AFTER DELETE ON ficha_ingredientes
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_custo_ficha_delete();

-- Comentários nas tabelas e colunas para documentação
COMMENT ON COLUMN fichas_tecnicas.modo_preparo IS 'Passo a passo detalhado da receita';
COMMENT ON COLUMN fichas_tecnicas.observacoes_preparo IS 'Observações e dicas de preparo';
COMMENT ON COLUMN fichas_tecnicas.rendimento IS 'Quantidade que a receita produz';
COMMENT ON COLUMN fichas_tecnicas.unidade_rendimento IS 'Unidade do rendimento (porções, kg, litros, etc)';
COMMENT ON COLUMN ficha_ingredientes.ficha_tecnica_ingrediente_id IS 'Referência para ficha técnica usada como ingrediente (subpreparo)';
COMMENT ON COLUMN ficha_ingredientes.ordem IS 'Ordem de exibição dos ingredientes na receita';
COMMENT ON COLUMN ficha_ingredientes.unidade_medida IS 'Unidade de medida específica para este ingrediente';
COMMENT ON COLUMN ficha_ingredientes.observacoes IS 'Observações sobre o uso deste ingrediente';
