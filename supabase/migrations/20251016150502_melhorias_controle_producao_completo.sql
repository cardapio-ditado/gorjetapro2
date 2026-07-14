/*
  # Melhorias Completas no Controle de Produção

  ## Novas Funcionalidades
  
  ### 1. Controle de Produção Ampliado
  Adiciona campos para rastreabilidade completa:
  - Lote único de produção
  - Horários reais de início e fim
  - Tempo total de produção
  - Quantidade produzida, aprovada e rejeitada
  - Percentual de desperdício
  - Estoque de destino

  ### 2. Histórico de Status
  Nova tabela para rastrear todas as mudanças de status:
  - Quem mudou o status
  - Quando mudou
  - Status anterior e novo
  - Observações da mudança

  ### 3. Controle de Qualidade
  Nova tabela para registro de inspeção:
  - Aprovação ou rejeição
  - Motivos de rejeição
  - Quantidade aprovada/rejeitada
  - Inspetor responsável
  - Ações corretivas

  ### 4. Reserva de Insumos
  Nova tabela para reservar insumos ao planejar produção:
  - Insumos reservados
  - Quantidade reservada
  - Status da reserva
  - Evita conflitos de estoque

  ### 5. Consumo Real de Insumos
  Nova tabela para registrar o que foi realmente usado:
  - Permite comparar planejado vs real
  - Identifica variações e desperdícios
  - Ajusta custos reais

  ## Segurança
  - RLS habilitado em todas as tabelas
  - Políticas restritivas para usuários autenticados
*/

-- 1. Adicionar novos campos na tabela producoes
ALTER TABLE producoes 
  ADD COLUMN IF NOT EXISTS lote_producao TEXT,
  ADD COLUMN IF NOT EXISTS hora_inicio TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hora_fim TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tempo_producao_minutos INTEGER,
  ADD COLUMN IF NOT EXISTS quantidade_produzida NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantidade_aprovada NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantidade_rejeitada NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_desperdicio NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_destino_id UUID REFERENCES estoques(id),
  ADD COLUMN IF NOT EXISTS usuario_inicio UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS usuario_conclusao UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS custo_real NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variacao_custo NUMERIC DEFAULT 0;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_producoes_lote ON producoes(lote_producao);
CREATE INDEX IF NOT EXISTS idx_producoes_data ON producoes(data_producao);
CREATE INDEX IF NOT EXISTS idx_producoes_status ON producoes(status);
CREATE INDEX IF NOT EXISTS idx_producoes_estoque_destino ON producoes(estoque_destino_id);

-- 2. Tabela de histórico de status da produção
CREATE TABLE IF NOT EXISTS producao_historico_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  data_mudanca TIMESTAMPTZ DEFAULT now(),
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_historico_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar histórico"
  ON producao_historico_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir histórico"
  ON producao_historico_status FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_historico_producao ON producao_historico_status(producao_id);
CREATE INDEX IF NOT EXISTS idx_historico_data ON producao_historico_status(data_mudanca);

-- 3. Tabela de controle de qualidade
CREATE TABLE IF NOT EXISTS producao_controle_qualidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  data_inspecao TIMESTAMPTZ DEFAULT now(),
  inspetor_id UUID REFERENCES auth.users(id),
  inspetor_nome TEXT,
  status_qualidade TEXT NOT NULL CHECK (status_qualidade IN ('aprovado', 'aprovado_com_ressalvas', 'rejeitado')),
  quantidade_aprovada NUMERIC DEFAULT 0,
  quantidade_rejeitada NUMERIC DEFAULT 0,
  motivo_rejeicao TEXT,
  acoes_corretivas TEXT,
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_controle_qualidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar controle qualidade"
  ON producao_controle_qualidade FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir controle qualidade"
  ON producao_controle_qualidade FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar controle qualidade"
  ON producao_controle_qualidade FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_qualidade_producao ON producao_controle_qualidade(producao_id);
CREATE INDEX IF NOT EXISTS idx_qualidade_status ON producao_controle_qualidade(status_qualidade);

-- 4. Tabela de reserva de insumos
CREATE TABLE IF NOT EXISTS producao_reserva_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES itens_estoque(id),
  quantidade_reservada NUMERIC NOT NULL,
  quantidade_utilizada NUMERIC DEFAULT 0,
  estoque_origem_id UUID REFERENCES estoques(id),
  status_reserva TEXT DEFAULT 'reservado' CHECK (status_reserva IN ('reservado', 'utilizado', 'cancelado', 'parcialmente_utilizado')),
  data_reserva TIMESTAMPTZ DEFAULT now(),
  data_utilizacao TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_reserva_insumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar reservas"
  ON producao_reserva_insumos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir reservas"
  ON producao_reserva_insumos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar reservas"
  ON producao_reserva_insumos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reserva_producao ON producao_reserva_insumos(producao_id);
CREATE INDEX IF NOT EXISTS idx_reserva_item ON producao_reserva_insumos(item_id);
CREATE INDEX IF NOT EXISTS idx_reserva_status ON producao_reserva_insumos(status_reserva);

-- 5. Tabela de consumo real de insumos
CREATE TABLE IF NOT EXISTS producao_consumo_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES itens_estoque(id),
  quantidade_planejada NUMERIC NOT NULL,
  quantidade_real NUMERIC NOT NULL,
  variacao NUMERIC GENERATED ALWAYS AS (quantidade_real - quantidade_planejada) STORED,
  percentual_variacao NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN quantidade_planejada > 0 THEN ((quantidade_real - quantidade_planejada) / quantidade_planejada * 100)
      ELSE 0
    END
  ) STORED,
  custo_unitario NUMERIC DEFAULT 0,
  custo_total NUMERIC GENERATED ALWAYS AS (quantidade_real * custo_unitario) STORED,
  motivo_variacao TEXT,
  registrado_em TIMESTAMPTZ DEFAULT now(),
  registrado_por UUID REFERENCES auth.users(id)
);

ALTER TABLE producao_consumo_insumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar consumo"
  ON producao_consumo_insumos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir consumo"
  ON producao_consumo_insumos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar consumo"
  ON producao_consumo_insumos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_consumo_producao ON producao_consumo_insumos(producao_id);
CREATE INDEX IF NOT EXISTS idx_consumo_item ON producao_consumo_insumos(item_id);

-- 6. View consolidada de produção com todos os detalhes
CREATE OR REPLACE VIEW vw_producao_completa AS
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
  (SELECT COUNT(*) FROM producao_historico_status WHERE producao_id = p.id) as total_mudancas_status

FROM producoes p
LEFT JOIN fichas_tecnicas ft ON ft.id = p.ficha_id
LEFT JOIN estoques e ON e.id = p.estoque_destino_id
LEFT JOIN producao_controle_qualidade cq ON cq.producao_id = p.id;

-- 7. Função para gerar código de lote único
CREATE OR REPLACE FUNCTION gerar_codigo_lote()
RETURNS TEXT AS $$
DECLARE
  codigo TEXT;
  ano TEXT;
  mes TEXT;
  dia TEXT;
  sequencia TEXT;
BEGIN
  ano := TO_CHAR(CURRENT_DATE, 'YY');
  mes := TO_CHAR(CURRENT_DATE, 'MM');
  dia := TO_CHAR(CURRENT_DATE, 'DD');
  
  SELECT LPAD((COUNT(*) + 1)::TEXT, 4, '0') INTO sequencia
  FROM producoes
  WHERE DATE(criado_em) = CURRENT_DATE;
  
  codigo := 'LOTE-' || ano || mes || dia || '-' || sequencia;
  
  RETURN codigo;
END;
$$ LANGUAGE plpgsql;

-- 8. Trigger para gerar lote automaticamente ao criar produção
CREATE OR REPLACE FUNCTION trigger_gerar_lote()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lote_producao IS NULL THEN
    NEW.lote_producao := gerar_codigo_lote();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS producao_gerar_lote ON producoes;
CREATE TRIGGER producao_gerar_lote
  BEFORE INSERT ON producoes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_gerar_lote();

-- 9. Trigger para registrar mudanças de status automaticamente
CREATE OR REPLACE FUNCTION trigger_registrar_mudanca_status()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO producao_historico_status (
      producao_id,
      status_anterior,
      status_novo,
      observacoes
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      'Mudança automática de status'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS producao_registrar_status ON producoes;
CREATE TRIGGER producao_registrar_status
  AFTER UPDATE ON producoes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_registrar_mudanca_status();

-- 10. Função para calcular tempo de produção
CREATE OR REPLACE FUNCTION calcular_tempo_producao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hora_inicio IS NOT NULL AND NEW.hora_fim IS NOT NULL THEN
    NEW.tempo_producao_minutos := EXTRACT(EPOCH FROM (NEW.hora_fim - NEW.hora_inicio)) / 60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS producao_calcular_tempo ON producoes;
CREATE TRIGGER producao_calcular_tempo
  BEFORE INSERT OR UPDATE ON producoes
  FOR EACH ROW
  EXECUTE FUNCTION calcular_tempo_producao();

-- 11. Função para calcular percentual de desperdício
CREATE OR REPLACE FUNCTION calcular_desperdicio()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantidade_produzida > 0 AND NEW.quantidade_aprovada IS NOT NULL THEN
    NEW.percentual_desperdicio := ((NEW.quantidade_produzida - NEW.quantidade_aprovada) / NEW.quantidade_produzida * 100);
    NEW.quantidade_rejeitada := NEW.quantidade_produzida - NEW.quantidade_aprovada;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS producao_calcular_desperdicio ON producoes;
CREATE TRIGGER producao_calcular_desperdicio
  BEFORE INSERT OR UPDATE ON producoes
  FOR EACH ROW
  EXECUTE FUNCTION calcular_desperdicio();
