/*
  # Correção Final do Módulo de Produção

  ## Alterações

  1. Garantir que todas as tabelas de produção existam
  2. Corrigir políticas RLS para acesso público (anon e authenticated)
  3. Adicionar campos faltantes
  4. Garantir que todos os triggers funcionem corretamente

  ## Segurança
  - RLS habilitado
  - Políticas permissivas para desenvolvimento
*/

-- 1. Garantir que a tabela producoes tem todos os campos necessários
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'lote_producao'
  ) THEN
    ALTER TABLE producoes ADD COLUMN lote_producao TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'hora_inicio'
  ) THEN
    ALTER TABLE producoes ADD COLUMN hora_inicio TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'hora_fim'
  ) THEN
    ALTER TABLE producoes ADD COLUMN hora_fim TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'tempo_producao_minutos'
  ) THEN
    ALTER TABLE producoes ADD COLUMN tempo_producao_minutos INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'quantidade_produzida'
  ) THEN
    ALTER TABLE producoes ADD COLUMN quantidade_produzida NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'quantidade_aprovada'
  ) THEN
    ALTER TABLE producoes ADD COLUMN quantidade_aprovada NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'quantidade_rejeitada'
  ) THEN
    ALTER TABLE producoes ADD COLUMN quantidade_rejeitada NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'percentual_desperdicio'
  ) THEN
    ALTER TABLE producoes ADD COLUMN percentual_desperdicio NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'estoque_destino_id'
  ) THEN
    ALTER TABLE producoes ADD COLUMN estoque_destino_id UUID REFERENCES estoques(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'usuario_inicio'
  ) THEN
    ALTER TABLE producoes ADD COLUMN usuario_inicio UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'usuario_conclusao'
  ) THEN
    ALTER TABLE producoes ADD COLUMN usuario_conclusao UUID;
  END IF;
END $$;

-- 2. Atualizar políticas da tabela producoes para permitir acesso público
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar produções" ON producoes;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir produções" ON producoes;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar produções" ON producoes;
DROP POLICY IF EXISTS "Usuários autenticados podem excluir produções" ON producoes;
DROP POLICY IF EXISTS "Permitir acesso total às produções" ON producoes;

CREATE POLICY "Permitir acesso total às produções"
  ON producoes FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 3. Garantir que as tabelas auxiliares existam
CREATE TABLE IF NOT EXISTS producao_historico_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  usuario_id UUID,
  data_mudanca TIMESTAMPTZ DEFAULT now(),
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS producao_controle_qualidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  data_inspecao TIMESTAMPTZ DEFAULT now(),
  inspetor_id UUID,
  inspetor_nome TEXT,
  status_qualidade TEXT NOT NULL CHECK (status_qualidade IN ('aprovado', 'aprovado_com_ressalvas', 'rejeitado')),
  quantidade_aprovada NUMERIC DEFAULT 0,
  quantidade_rejeitada NUMERIC DEFAULT 0,
  motivo_rejeicao TEXT,
  acoes_corretivas TEXT,
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS producao_consumo_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES producoes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES itens_estoque(id),
  quantidade_planejada NUMERIC NOT NULL,
  quantidade_real NUMERIC NOT NULL,
  variacao NUMERIC,
  percentual_variacao NUMERIC,
  custo_unitario NUMERIC DEFAULT 0,
  custo_total NUMERIC,
  motivo_variacao TEXT,
  registrado_em TIMESTAMPTZ DEFAULT now(),
  registrado_por UUID
);

-- 4. Habilitar RLS
ALTER TABLE producao_historico_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_controle_qualidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_reserva_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_consumo_insumos ENABLE ROW LEVEL SECURITY;

-- 5. Criar índices
CREATE INDEX IF NOT EXISTS idx_producoes_lote ON producoes(lote_producao);
CREATE INDEX IF NOT EXISTS idx_producoes_data ON producoes(data_producao);
CREATE INDEX IF NOT EXISTS idx_producoes_status ON producoes(status);
CREATE INDEX IF NOT EXISTS idx_producoes_estoque_destino ON producoes(estoque_destino_id);
CREATE INDEX IF NOT EXISTS idx_historico_producao ON producao_historico_status(producao_id);
CREATE INDEX IF NOT EXISTS idx_qualidade_producao ON producao_controle_qualidade(producao_id);
CREATE INDEX IF NOT EXISTS idx_reserva_producao ON producao_reserva_insumos(producao_id);
CREATE INDEX IF NOT EXISTS idx_consumo_producao ON producao_consumo_insumos(producao_id);

-- 6. Recriar view consolidada
DROP VIEW IF EXISTS vw_producao_completa;
CREATE VIEW vw_producao_completa AS
SELECT
  p.*,
  ft.nome as ficha_nome,
  ft.porcoes as ficha_porcoes,
  ft.tempo_preparo as tempo_preparo_esperado,
  ft.categoria as ficha_categoria,
  e.nome as estoque_destino_nome,
  e.tipo as estoque_destino_tipo
FROM producoes p
LEFT JOIN fichas_tecnicas ft ON ft.id = p.ficha_id
LEFT JOIN estoques e ON e.id = p.estoque_destino_id;

-- 7. Garantir função e trigger de lote
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
