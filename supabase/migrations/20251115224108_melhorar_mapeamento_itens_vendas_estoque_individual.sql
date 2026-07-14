/*
  # Melhoria no Sistema de Mapeamento - Estoque Individual por Item

  1. Alterações na Tabela `mapeamento_itens_vendas`
    - Adiciona campo `estoque_id` para rastrear qual estoque é usado para cada produto
    - Permite que a IA aprenda qual estoque usar para cada item específico
    
  2. Alterações na Tabela `itens_importacao_vendas`
    - Adiciona campo `estoque_id` para permitir estoque diferente por item
    - Armazena sugestão da IA de qual estoque usar
    
  3. Nova Lógica
    - Cada produto pode ter mapeamentos diferentes para estoques diferentes
    - IA aprende: "Coca Cola 2L no Estoque Bar" vs "Coca Cola 2L no Estoque Cozinha"
    - Histórico usado para sugerir estoque mais provável

  4. Security
    - Mantém RLS existente
*/

-- Adicionar estoque_id ao mapeamento
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mapeamento_itens_vendas' AND column_name = 'estoque_id'
  ) THEN
    ALTER TABLE mapeamento_itens_vendas ADD COLUMN estoque_id uuid REFERENCES estoques(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_mapeamento_estoque ON mapeamento_itens_vendas(estoque_id);
  END IF;
END $$;

-- Adicionar estoque_id aos itens de importação
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_importacao_vendas' AND column_name = 'estoque_id'
  ) THEN
    ALTER TABLE itens_importacao_vendas ADD COLUMN estoque_id uuid REFERENCES estoques(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_itens_importacao_estoque ON itens_importacao_vendas(estoque_id);
  END IF;
END $$;

-- Adicionar confianca_estoque para rastrear confiança da IA na sugestão de estoque
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_importacao_vendas' AND column_name = 'confianca_estoque'
  ) THEN
    ALTER TABLE itens_importacao_vendas 
    ADD COLUMN confianca_estoque numeric DEFAULT 0 CHECK (confianca_estoque >= 0 AND confianca_estoque <= 1);
  END IF;
END $$;

-- Remover estoque_id da tabela importacoes_vendas se existir (não é mais necessário)
-- Cada item pode vir de estoque diferente

-- Função melhorada para buscar mapeamentos com estoque
CREATE OR REPLACE FUNCTION buscar_mapeamento_com_estoque(
  p_nome_produto text,
  p_estoque_id uuid DEFAULT NULL
)
RETURNS TABLE (
  item_estoque_id uuid,
  item_estoque_nome text,
  estoque_id uuid,
  estoque_nome text,
  confianca numeric,
  usado_vezes integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.item_estoque_id,
    ie.nome as item_estoque_nome,
    m.estoque_id,
    e.nome as estoque_nome,
    m.confianca,
    m.usado_vezes
  FROM mapeamento_itens_vendas m
  INNER JOIN itens_estoque ie ON ie.id = m.item_estoque_id
  INNER JOIN estoques e ON e.id = COALESCE(m.estoque_id, ie.estoque_id)
  WHERE 
    (m.nome_externo = p_nome_produto OR m.nome_normalizado = normalizar_nome_produto(p_nome_produto))
    AND (p_estoque_id IS NULL OR m.estoque_id = p_estoque_id OR m.estoque_id IS NULL)
  ORDER BY m.usado_vezes DESC, m.confianca DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar mapeamento incluindo estoque
CREATE OR REPLACE FUNCTION atualizar_uso_mapeamento_com_estoque()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'processado' AND NEW.item_estoque_id IS NOT NULL THEN
    -- Tenta atualizar mapeamento existente
    UPDATE mapeamento_itens_vendas
    SET 
      usado_vezes = usado_vezes + 1,
      ultima_utilizacao = now(),
      estoque_id = COALESCE(NEW.estoque_id, estoque_id),
      atualizado_em = now()
    WHERE 
      nome_externo = NEW.nome_produto_externo
      AND item_estoque_id = NEW.item_estoque_id
      AND (estoque_id = NEW.estoque_id OR (estoque_id IS NULL AND NEW.estoque_id IS NULL));
    
    -- Se não atualizou nada, o mapeamento não existe - será criado na confirmação
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atualizar trigger
DROP TRIGGER IF EXISTS trigger_atualizar_uso_mapeamento ON itens_importacao_vendas;
DROP TRIGGER IF EXISTS trigger_atualizar_uso_mapeamento_com_estoque ON itens_importacao_vendas;

CREATE TRIGGER trigger_atualizar_uso_mapeamento_com_estoque
  AFTER UPDATE ON itens_importacao_vendas
  FOR EACH ROW
  WHEN (NEW.status = 'processado' AND OLD.status != 'processado')
  EXECUTE FUNCTION atualizar_uso_mapeamento_com_estoque();

-- View para estatísticas de uso por estoque
CREATE OR REPLACE VIEW v_estatisticas_mapeamento_estoque AS
SELECT 
  m.nome_externo,
  ie.nome as item_nome,
  e.nome as estoque_nome,
  m.usado_vezes,
  m.ultima_utilizacao,
  m.confianca,
  m.origem
FROM mapeamento_itens_vendas m
INNER JOIN itens_estoque ie ON ie.id = m.item_estoque_id
LEFT JOIN estoques e ON e.id = m.estoque_id
ORDER BY m.usado_vezes DESC;
