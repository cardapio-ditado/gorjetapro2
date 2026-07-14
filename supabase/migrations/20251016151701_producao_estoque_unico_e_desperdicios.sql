/*
  # Melhorias Produção - Estoque Único e Desperdícios

  ## Alterações

  ### 1. Tabela de Transferências Automáticas
  Nova tabela para registrar transferências do estoque central para produção:
  - Transferências automáticas ao detectar falta
  - Rastreamento completo de origem e destino
  - Status da transferência

  ### 2. Tabela de Desperdícios Detalhados
  Nova tabela para registrar desperdícios e sobras:
  - Tipo de perda (desperdício, sobra, quebra, vencimento)
  - Item específico desperdiçado
  - Quantidade e motivo detalhado
  - Responsável pelo registro
  - Ação corretiva tomada

  ### 3. Tabela de Observações de Produção
  Nova tabela para registrar observações detalhadas:
  - Observações por etapa (preparação, produção, finalização)
  - Problemas encontrados
  - Ajustes feitos na receita
  - Sugestões de melhoria

  ### 4. Campos Adicionais em Produção
  - Temperatura ambiente
  - Umidade
  - Equipamentos utilizados
  - Número de pessoas envolvidas
  - Observações gerais mais estruturadas
*/

-- 1. Tabela de transferências automáticas entre estoques
CREATE TABLE IF NOT EXISTS producao_transferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES itens_estoque(id),
  estoque_origem_id UUID NOT NULL REFERENCES estoques(id),
  estoque_destino_id UUID NOT NULL REFERENCES estoques(id),
  quantidade_transferida NUMERIC NOT NULL,
  motivo TEXT DEFAULT 'Transferência automática para produção',
  status_transferencia TEXT DEFAULT 'concluida' CHECK (status_transferencia IN ('pendente', 'concluida', 'cancelada')),
  realizada_em TIMESTAMPTZ DEFAULT now(),
  realizada_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_transferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar transferências"
  ON producao_transferencias FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar transferências"
  ON producao_transferencias FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_transferencias_producao ON producao_transferencias(producao_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_item ON producao_transferencias(item_id);

-- 2. Tabela de desperdícios e sobras detalhados
CREATE TABLE IF NOT EXISTS producao_desperdicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES itens_estoque(id),
  tipo_perda TEXT NOT NULL CHECK (tipo_perda IN ('desperdicio', 'sobra', 'quebra', 'vencimento', 'contaminacao', 'erro_preparo', 'outro')),
  quantidade NUMERIC NOT NULL,
  unidade_medida TEXT,
  custo_estimado NUMERIC DEFAULT 0,
  motivo_detalhado TEXT NOT NULL,
  etapa_producao TEXT CHECK (etapa_producao IN ('preparacao', 'producao', 'finalizacao', 'armazenamento')),
  responsavel_registro TEXT,
  acao_corretiva TEXT,
  pode_ser_reaproveitado BOOLEAN DEFAULT false,
  forma_reaproveitamento TEXT,
  registrado_em TIMESTAMPTZ DEFAULT now(),
  registrado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_desperdicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar desperdícios"
  ON producao_desperdicios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem registrar desperdícios"
  ON producao_desperdicios FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar desperdícios"
  ON producao_desperdicios FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_desperdicios_producao ON producao_desperdicios(producao_id);
CREATE INDEX IF NOT EXISTS idx_desperdicios_tipo ON producao_desperdicios(tipo_perda);

-- 3. Tabela de observações detalhadas por etapa
CREATE TABLE IF NOT EXISTS producao_observacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL CHECK (etapa IN ('planejamento', 'preparacao', 'producao', 'finalizacao', 'armazenamento', 'geral')),
  tipo_observacao TEXT CHECK (tipo_observacao IN ('problema', 'ajuste', 'melhoria', 'informacao', 'alerta')),
  titulo TEXT,
  descricao TEXT NOT NULL,
  criticidade TEXT CHECK (criticidade IN ('baixa', 'media', 'alta', 'critica')),
  requer_acao BOOLEAN DEFAULT false,
  acao_tomada TEXT,
  registrado_por_nome TEXT,
  registrado_por UUID REFERENCES auth.users(id),
  registrado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_observacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar observações"
  ON producao_observacoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar observações"
  ON producao_observacoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar observações"
  ON producao_observacoes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_observacoes_producao ON producao_observacoes(producao_id);
CREATE INDEX IF NOT EXISTS idx_observacoes_etapa ON producao_observacoes(etapa);

-- 4. Adicionar campos adicionais em produção
ALTER TABLE producoes 
  ADD COLUMN IF NOT EXISTS temperatura_ambiente NUMERIC,
  ADD COLUMN IF NOT EXISTS umidade_ambiente NUMERIC,
  ADD COLUMN IF NOT EXISTS equipamentos_utilizados TEXT[],
  ADD COLUMN IF NOT EXISTS num_pessoas_envolvidas INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS condicoes_ambiente TEXT,
  ADD COLUMN IF NOT EXISTS nivel_dificuldade_real TEXT CHECK (nivel_dificuldade_real IN ('facil', 'medio', 'dificil', 'muito_dificil')),
  ADD COLUMN IF NOT EXISTS rendimento_real NUMERIC,
  ADD COLUMN IF NOT EXISTS rendimento_esperado NUMERIC,
  ADD COLUMN IF NOT EXISTS variacao_rendimento NUMERIC,
  ADD COLUMN IF NOT EXISTS motivo_variacao_rendimento TEXT;

-- 5. Função para calcular variação de rendimento
CREATE OR REPLACE FUNCTION calcular_variacao_rendimento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rendimento_esperado IS NOT NULL AND NEW.rendimento_esperado > 0 THEN
    IF NEW.rendimento_real IS NOT NULL THEN
      NEW.variacao_rendimento := ((NEW.rendimento_real - NEW.rendimento_esperado) / NEW.rendimento_esperado * 100);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS producao_calcular_rendimento ON producoes;
CREATE TRIGGER producao_calcular_rendimento
  BEFORE INSERT OR UPDATE ON producoes
  FOR EACH ROW
  EXECUTE FUNCTION calcular_variacao_rendimento();

-- 6. View consolidada com todas as informações
CREATE OR REPLACE VIEW vw_producao_completa_detalhada AS
SELECT 
  p.*,
  ft.nome as ficha_nome,
  ft.porcoes as ficha_porcoes,
  ft.tempo_preparo as tempo_preparo_esperado,
  ft.categoria as ficha_categoria,
  ft.dificuldade as ficha_dificuldade,
  e.nome as estoque_destino_nome,
  e.tipo as estoque_destino_tipo,
  
  -- Controle de qualidade
  cq.status_qualidade,
  cq.inspetor_nome,
  cq.data_inspecao,
  cq.motivo_rejeicao,
  
  -- Estatísticas de reserva
  (SELECT COUNT(*) FROM producao_reserva_insumos WHERE producao_id = p.id) as total_insumos_reservados,
  (SELECT COUNT(*) FROM producao_reserva_insumos WHERE producao_id = p.id AND status_reserva = 'utilizado') as insumos_utilizados,
  
  -- Estatísticas de consumo
  (SELECT SUM(custo_total) FROM producao_consumo_insumos WHERE producao_id = p.id) as custo_insumos_real,
  (SELECT COUNT(*) FROM producao_consumo_insumos WHERE producao_id = p.id AND ABS(percentual_variacao) > 10) as itens_com_variacao_significativa,
  
  -- Estatísticas de histórico
  (SELECT COUNT(*) FROM producao_historico_status WHERE producao_id = p.id) as total_mudancas_status,
  
  -- Desperdícios e sobras
  (SELECT COUNT(*) FROM producao_desperdicios WHERE producao_id = p.id) as total_registros_desperdicio,
  (SELECT SUM(quantidade) FROM producao_desperdicios WHERE producao_id = p.id AND tipo_perda = 'desperdicio') as total_desperdicios,
  (SELECT SUM(quantidade) FROM producao_desperdicios WHERE producao_id = p.id AND tipo_perda = 'sobra') as total_sobras,
  (SELECT SUM(custo_estimado) FROM producao_desperdicios WHERE producao_id = p.id) as custo_total_perdas,
  
  -- Transferências
  (SELECT COUNT(*) FROM producao_transferencias WHERE producao_id = p.id) as total_transferencias,
  (SELECT SUM(quantidade_transferida) FROM producao_transferencias WHERE producao_id = p.id) as total_quantidade_transferida,
  
  -- Observações
  (SELECT COUNT(*) FROM producao_observacoes WHERE producao_id = p.id) as total_observacoes,
  (SELECT COUNT(*) FROM producao_observacoes WHERE producao_id = p.id AND criticidade IN ('alta', 'critica')) as observacoes_criticas

FROM producoes p
LEFT JOIN fichas_tecnicas ft ON ft.id = p.ficha_id
LEFT JOIN estoques e ON e.id = p.estoque_destino_id
LEFT JOIN producao_controle_qualidade cq ON cq.producao_id = p.id;

-- 7. Função para calcular totais de desperdício automaticamente
CREATE OR REPLACE FUNCTION atualizar_totais_desperdicio()
RETURNS TRIGGER AS $$
DECLARE
  total_desp NUMERIC;
  total_sobr NUMERIC;
  custo_perdas NUMERIC;
BEGIN
  -- Calcular totais de desperdício
  SELECT 
    COALESCE(SUM(CASE WHEN tipo_perda = 'desperdicio' THEN quantidade ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo_perda = 'sobra' THEN quantidade ELSE 0 END), 0),
    COALESCE(SUM(custo_estimado), 0)
  INTO total_desp, total_sobr, custo_perdas
  FROM producao_desperdicios
  WHERE producao_id = COALESCE(NEW.producao_id, OLD.producao_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_atualizar_totais_desperdicio ON producao_desperdicios;
CREATE TRIGGER trigger_atualizar_totais_desperdicio
  AFTER INSERT OR UPDATE OR DELETE ON producao_desperdicios
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_totais_desperdicio();

-- 8. Comentários para documentação
COMMENT ON TABLE producao_transferencias IS 'Registra transferências automáticas de insumos do estoque central para produção';
COMMENT ON TABLE producao_desperdicios IS 'Registra desperdícios, sobras e perdas durante a produção com detalhamento completo';
COMMENT ON TABLE producao_observacoes IS 'Registra observações detalhadas por etapa da produção para rastreabilidade e melhoria contínua';
