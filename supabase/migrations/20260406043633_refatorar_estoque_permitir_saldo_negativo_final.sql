/*
  # Refatoração: Sistema de Estoque com Saldo Negativo
  
  ## Resumo
  
  Refatoração completa do sistema de estoque para permitir saldos negativos com controle total.
  
  ## Mudanças Principais
  
  1. Remove constraints que impedem negativos
  2. Adiciona colunas de rastreamento em saldos_estoque
  3. Cria tabelas: alertas_estoque_negativo, auditoria_estoque
  4. Cria view materializada vw_saldos_consolidados
  5. Implementa triggers automáticos para alertas e auditoria
  6. Adiciona índices otimizados
*/

-- =====================================================
-- 1. REMOVER CONSTRAINTS QUE IMPEDEM NEGATIVOS
-- =====================================================

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'saldos_estoque_quantidade_atual_check' 
    AND table_name = 'saldos_estoque'
  ) THEN
    ALTER TABLE saldos_estoque DROP CONSTRAINT saldos_estoque_quantidade_atual_check;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'saldos_estoque_valor_total_check' 
    AND table_name = 'saldos_estoque'
  ) THEN
    ALTER TABLE saldos_estoque DROP CONSTRAINT saldos_estoque_valor_total_check;
  END IF;
END $$;

-- =====================================================
-- 2. ADICIONAR COLUNAS EM saldos_estoque
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saldos_estoque' AND column_name = 'custo_medio'
  ) THEN
    ALTER TABLE saldos_estoque ADD COLUMN custo_medio DECIMAL(10,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saldos_estoque' AND column_name = 'primeira_data_negativo'
  ) THEN
    ALTER TABLE saldos_estoque ADD COLUMN primeira_data_negativo TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saldos_estoque' AND column_name = 'valor_quando_negativo'
  ) THEN
    ALTER TABLE saldos_estoque ADD COLUMN valor_quando_negativo DECIMAL(10,2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saldos_estoque' AND column_name = 'qtd_vezes_negativo'
  ) THEN
    ALTER TABLE saldos_estoque ADD COLUMN qtd_vezes_negativo INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saldos_estoque' AND column_name = 'ultima_regularizacao'
  ) THEN
    ALTER TABLE saldos_estoque ADD COLUMN ultima_regularizacao TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================
-- 3. CRIAR TABELA DE ALERTAS
-- =====================================================

CREATE TABLE IF NOT EXISTS alertas_estoque_negativo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES itens_estoque(id) ON DELETE CASCADE,
  estoque_id UUID NOT NULL REFERENCES estoques(id) ON DELETE CASCADE,
  quantidade_negativa DECIMAL(10,2) NOT NULL,
  valor_negativo DECIMAL(10,2),
  data_alerta TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_regularizacao TIMESTAMPTZ,
  movimentacao_id UUID REFERENCES movimentacoes_estoque(id) ON DELETE SET NULL,
  observacoes TEXT,
  notificado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alertas_estoque_negativo ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'alertas_estoque_negativo' 
    AND policyname = 'Usuários autenticados podem ver alertas'
  ) THEN
    CREATE POLICY "Usuários autenticados podem ver alertas"
      ON alertas_estoque_negativo FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'alertas_estoque_negativo' 
    AND policyname = 'Usuários autenticados podem criar alertas'
  ) THEN
    CREATE POLICY "Usuários autenticados podem criar alertas"
      ON alertas_estoque_negativo FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'alertas_estoque_negativo' 
    AND policyname = 'Usuários autenticados podem atualizar alertas'
  ) THEN
    CREATE POLICY "Usuários autenticados podem atualizar alertas"
      ON alertas_estoque_negativo FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =====================================================
-- 4. CRIAR TABELA DE AUDITORIA
-- =====================================================

CREATE TABLE IF NOT EXISTS auditoria_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES itens_estoque(id) ON DELETE CASCADE,
  estoque_id UUID NOT NULL REFERENCES estoques(id) ON DELETE CASCADE,
  movimentacao_id UUID REFERENCES movimentacoes_estoque(id) ON DELETE SET NULL,
  quantidade_anterior DECIMAL(10,2) NOT NULL,
  quantidade_nova DECIMAL(10,2) NOT NULL,
  custo_anterior DECIMAL(10,2),
  custo_novo DECIMAL(10,2),
  valor_anterior DECIMAL(10,2),
  valor_novo DECIMAL(10,2),
  ficou_negativo BOOLEAN DEFAULT false,
  regularizou_negativo BOOLEAN DEFAULT false,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE auditoria_estoque ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'auditoria_estoque' 
    AND policyname = 'Usuários autenticados podem ver auditoria'
  ) THEN
    CREATE POLICY "Usuários autenticados podem ver auditoria"
      ON auditoria_estoque FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'auditoria_estoque' 
    AND policyname = 'Sistema pode inserir auditoria'
  ) THEN
    CREATE POLICY "Sistema pode inserir auditoria"
      ON auditoria_estoque FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- =====================================================
-- 5. CRIAR VIEW MATERIALIZADA CONSOLIDADA
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS vw_saldos_consolidados CASCADE;

CREATE MATERIALIZED VIEW vw_saldos_consolidados AS
SELECT 
  s.id as saldo_id,
  s.estoque_id,
  e.nome as estoque_nome,
  s.item_id,
  i.codigo as item_codigo,
  i.nome as item_nome,
  i.unidade_medida,
  s.quantidade_atual,
  s.custo_medio,
  s.valor_total,
  s.primeira_data_negativo,
  s.qtd_vezes_negativo,
  s.ultima_regularizacao,
  CASE 
    WHEN s.quantidade_atual < 0 THEN 'NEGATIVO'
    WHEN s.quantidade_atual = 0 THEN 'ZERADO'
    WHEN s.quantidade_atual <= COALESCE(i.estoque_minimo, 0) THEN 'CRÍTICO'
    WHEN s.quantidade_atual <= COALESCE(i.estoque_minimo, 0) * 1.5 THEN 'BAIXO'
    ELSE 'NORMAL'
  END as status_estoque
FROM saldos_estoque s
JOIN itens_estoque i ON i.id = s.item_id
JOIN estoques e ON e.id = s.estoque_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vw_saldos_consolidados_unique 
  ON vw_saldos_consolidados(estoque_id, item_id);

CREATE INDEX IF NOT EXISTS idx_vw_saldos_consolidados_status 
  ON vw_saldos_consolidados(status_estoque);

-- =====================================================
-- 6. TRIGGER PARA ALERTAS (BEFORE UPDATE)
-- =====================================================

CREATE OR REPLACE FUNCTION registrar_alerta_negativo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.quantidade_atual >= 0 AND NEW.quantidade_atual < 0 THEN
    NEW.primeira_data_negativo := COALESCE(NEW.primeira_data_negativo, now());
    NEW.valor_quando_negativo := NEW.valor_total;
    NEW.qtd_vezes_negativo := COALESCE(NEW.qtd_vezes_negativo, 0) + 1;
    
    INSERT INTO alertas_estoque_negativo (
      item_id,
      estoque_id,
      quantidade_negativa,
      valor_negativo,
      data_alerta
    ) VALUES (
      NEW.item_id,
      NEW.estoque_id,
      ABS(NEW.quantidade_atual),
      NEW.valor_total,
      now()
    );
  END IF;

  IF OLD.quantidade_atual < 0 AND NEW.quantidade_atual >= 0 THEN
    UPDATE alertas_estoque_negativo
    SET data_regularizacao = now(),
        updated_at = now()
    WHERE item_id = NEW.item_id
      AND estoque_id = NEW.estoque_id
      AND data_regularizacao IS NULL;
    
    NEW.ultima_regularizacao := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_alerta_negativo ON saldos_estoque;

CREATE TRIGGER trigger_alerta_negativo
  BEFORE UPDATE ON saldos_estoque
  FOR EACH ROW
  WHEN (OLD.quantidade_atual IS DISTINCT FROM NEW.quantidade_atual)
  EXECUTE FUNCTION registrar_alerta_negativo();

-- =====================================================
-- 7. TRIGGER PARA AUDITORIA (AFTER UPDATE)
-- =====================================================

CREATE OR REPLACE FUNCTION auditar_mudanca_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ficou_negativo BOOLEAN := false;
  v_regularizou_negativo BOOLEAN := false;
BEGIN
  IF OLD.quantidade_atual >= 0 AND NEW.quantidade_atual < 0 THEN
    v_ficou_negativo := true;
  END IF;

  IF OLD.quantidade_atual < 0 AND NEW.quantidade_atual >= 0 THEN
    v_regularizou_negativo := true;
  END IF;

  INSERT INTO auditoria_estoque (
    item_id,
    estoque_id,
    quantidade_anterior,
    quantidade_nova,
    custo_anterior,
    custo_novo,
    valor_anterior,
    valor_novo,
    ficou_negativo,
    regularizou_negativo,
    usuario_id
  ) VALUES (
    NEW.item_id,
    NEW.estoque_id,
    OLD.quantidade_atual,
    NEW.quantidade_atual,
    OLD.custo_medio,
    NEW.custo_medio,
    OLD.valor_total,
    NEW.valor_total,
    v_ficou_negativo,
    v_regularizou_negativo,
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auditar_saldo ON saldos_estoque;

CREATE TRIGGER trigger_auditar_saldo
  AFTER UPDATE ON saldos_estoque
  FOR EACH ROW
  WHEN (
    OLD.quantidade_atual IS DISTINCT FROM NEW.quantidade_atual OR
    OLD.custo_medio IS DISTINCT FROM NEW.custo_medio OR
    OLD.valor_total IS DISTINCT FROM NEW.valor_total
  )
  EXECUTE FUNCTION auditar_mudanca_saldo();

-- =====================================================
-- 8. ÍNDICES OTIMIZADOS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_movimentacoes_kardex 
  ON movimentacoes_estoque(item_id, data_movimentacao DESC);

CREATE INDEX IF NOT EXISTS idx_saldos_estoque_negativo 
  ON saldos_estoque(estoque_id, item_id) 
  WHERE quantidade_atual < 0;

CREATE INDEX IF NOT EXISTS idx_auditoria_item_data 
  ON auditoria_estoque(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_estoque 
  ON auditoria_estoque(estoque_id, created_at DESC);
