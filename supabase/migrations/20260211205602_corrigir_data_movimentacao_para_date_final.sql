/*
  # Corrigir tipo de data_movimentacao para DATE
  
  1. Problema Identificado
    - Campo `data_movimentacao` está como `timestamptz` (timestamp with timezone)
    - Quando usuário insere data 11/02, PostgreSQL interpreta como 11/02 00:00 UTC
    - No timezone Brasil (UTC-3), isso vira 10/02 21:00, mostrando dia anterior
    - Filtros por data também ficam inconsistentes
    
  2. Solução
    - Remover view dependente temporariamente
    - Alterar tipo da coluna para `date` (apenas data, sem hora)
    - Recriar view
    - Isso elimina confusões de timezone para campos que representam apenas datas
    
  3. Impacto
    - Movimentações mostrarão sempre a data correta independente de timezone
    - Filtros por data funcionarão corretamente
    - Dados históricos serão preservados (convertidos para date no timezone America/Sao_Paulo)
*/

-- 1. Remover view dependente
DROP VIEW IF EXISTS vw_movimentacoes_detalhadas;

-- 2. Alterar tipo da coluna data_movimentacao de timestamptz para date
-- A conversão AT TIME ZONE converte para o timezone local antes de extrair a data
ALTER TABLE movimentacoes_estoque 
ALTER COLUMN data_movimentacao TYPE date 
USING (data_movimentacao AT TIME ZONE 'America/Sao_Paulo')::date;

-- 3. Alterar o default para usar CURRENT_DATE
ALTER TABLE movimentacoes_estoque 
ALTER COLUMN data_movimentacao SET DEFAULT CURRENT_DATE;

-- 4. Recriar a view
CREATE OR REPLACE VIEW vw_movimentacoes_detalhadas AS
SELECT 
  m.id,
  m.tipo_movimentacao,
  m.data_movimentacao,
  m.quantidade,
  m.custo_unitario,
  m.custo_total,
  m.motivo,
  m.observacoes,
  i.codigo as item_codigo,
  i.nome as item_nome,
  i.unidade_medida,
  eo.nome as estoque_origem_nome,
  ed.nome as estoque_destino_nome
FROM movimentacoes_estoque m
JOIN itens_estoque i ON i.id = m.item_id
LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id
LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id
ORDER BY m.data_movimentacao DESC;

-- 5. Criar índice na coluna data_movimentacao para otimizar filtros
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_data 
ON movimentacoes_estoque(data_movimentacao);
