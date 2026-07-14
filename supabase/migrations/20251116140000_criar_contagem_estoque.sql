/*
  # Sistema de Contagem de Estoque

  ## Descrição
  Sistema completo para contagem física de estoque com comparação automática,
  ajustes e histórico de conferências.

  ## 1. Novas Tabelas

  ### `contagens_estoque`
  Tabela principal de contagens de estoque
  - `id` (uuid, PK) - Identificador único
  - `estoque_id` (uuid, FK) - Referência ao estoque
  - `data_contagem` (timestamp) - Data/hora da contagem
  - `responsavel` (text) - Nome do responsável
  - `status` (text) - Status: em_andamento, finalizada, processada
  - `observacoes` (text) - Observações gerais
  - `criado_por` (uuid, FK) - Usuário que criou
  - `criado_em` (timestamp) - Data de criação
  - `finalizado_em` (timestamp) - Data de finalização
  - `processado_em` (timestamp) - Data de processamento

  ### `contagens_estoque_itens`
  Itens contados em cada contagem
  - `id` (uuid, PK) - Identificador único
  - `contagem_id` (uuid, FK) - Referência à contagem
  - `item_estoque_id` (uuid, FK) - Referência ao item
  - `quantidade_sistema` (decimal) - Quantidade no sistema
  - `quantidade_contada` (decimal) - Quantidade contada fisicamente
  - `diferenca` (decimal) - Diferença calculada
  - `valor_unitario` (decimal) - Valor unitário no momento
  - `valor_diferenca` (decimal) - Valor da diferença
  - `observacao` (text) - Observação do item
  - `contado_em` (timestamp) - Momento da contagem

  ### `contagens_estoque_ajustes`
  Ajustes realizados após contagem
  - `id` (uuid, PK) - Identificador único
  - `contagem_id` (uuid, FK) - Referência à contagem
  - `contagem_item_id` (uuid, FK) - Referência ao item contado
  - `tipo_ajuste` (text) - Tipo: perda, sobra, acerto
  - `quantidade_ajustada` (decimal) - Quantidade ajustada
  - `motivo` (text) - Motivo do ajuste
  - `movimentacao_id` (uuid, FK) - Referência à movimentação criada
  - `criado_por` (uuid, FK) - Usuário que criou
  - `criado_em` (timestamp) - Data de criação

  ## 2. Security
  - RLS habilitado em todas as tabelas
  - Políticas para usuários autenticados

  ## 3. Índices
  - Índices para melhor performance nas consultas
*/

-- Tabela principal de contagens
CREATE TABLE IF NOT EXISTS contagens_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id uuid NOT NULL REFERENCES estoques(id) ON DELETE RESTRICT,
  data_contagem timestamptz NOT NULL DEFAULT now(),
  responsavel text NOT NULL,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizada', 'processada', 'cancelada')),
  observacoes text,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz DEFAULT now(),
  finalizado_em timestamptz,
  processado_em timestamptz,
  total_itens_contados integer DEFAULT 0,
  total_diferencas integer DEFAULT 0,
  valor_total_diferencas decimal(15,2) DEFAULT 0
);

-- Itens da contagem
CREATE TABLE IF NOT EXISTS contagens_estoque_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id uuid NOT NULL REFERENCES contagens_estoque(id) ON DELETE CASCADE,
  item_estoque_id uuid NOT NULL REFERENCES itens_estoque(id) ON DELETE RESTRICT,
  quantidade_sistema decimal(15,3) NOT NULL DEFAULT 0,
  quantidade_contada decimal(15,3) NOT NULL DEFAULT 0,
  diferenca decimal(15,3) GENERATED ALWAYS AS (quantidade_contada - quantidade_sistema) STORED,
  valor_unitario decimal(15,2) NOT NULL DEFAULT 0,
  valor_diferenca decimal(15,2) GENERATED ALWAYS AS ((quantidade_contada - quantidade_sistema) * valor_unitario) STORED,
  observacao text,
  contado_em timestamptz DEFAULT now(),
  UNIQUE(contagem_id, item_estoque_id)
);

-- Ajustes realizados
CREATE TABLE IF NOT EXISTS contagens_estoque_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id uuid NOT NULL REFERENCES contagens_estoque(id) ON DELETE CASCADE,
  contagem_item_id uuid NOT NULL REFERENCES contagens_estoque_itens(id) ON DELETE CASCADE,
  tipo_ajuste text NOT NULL CHECK (tipo_ajuste IN ('perda', 'sobra', 'acerto')),
  quantidade_ajustada decimal(15,3) NOT NULL,
  motivo text NOT NULL,
  movimentacao_id uuid REFERENCES movimentacoes_estoque(id),
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_contagens_estoque_data ON contagens_estoque(data_contagem DESC);
CREATE INDEX IF NOT EXISTS idx_contagens_estoque_status ON contagens_estoque(status);
CREATE INDEX IF NOT EXISTS idx_contagens_estoque_estoque_id ON contagens_estoque(estoque_id);
CREATE INDEX IF NOT EXISTS idx_contagens_itens_contagem ON contagens_estoque_itens(contagem_id);
CREATE INDEX IF NOT EXISTS idx_contagens_ajustes_contagem ON contagens_estoque_ajustes(contagem_id);

-- Habilitar RLS
ALTER TABLE contagens_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE contagens_estoque_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE contagens_estoque_ajustes ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança para contagens_estoque
CREATE POLICY "Usuários autenticados podem visualizar contagens"
  ON contagens_estoque FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar contagens"
  ON contagens_estoque FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários podem atualizar suas contagens não processadas"
  ON contagens_estoque FOR UPDATE
  TO authenticated
  USING (status IN ('em_andamento', 'finalizada'))
  WITH CHECK (status IN ('em_andamento', 'finalizada', 'processada', 'cancelada'));

-- Políticas para contagens_estoque_itens
CREATE POLICY "Usuários autenticados podem visualizar itens contados"
  ON contagens_estoque_itens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir itens contados"
  ON contagens_estoque_itens FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contagens_estoque
      WHERE id = contagem_id AND status = 'em_andamento'
    )
  );

CREATE POLICY "Usuários podem atualizar itens de contagens não finalizadas"
  ON contagens_estoque_itens FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contagens_estoque
      WHERE id = contagem_id AND status = 'em_andamento'
    )
  );

CREATE POLICY "Usuários podem deletar itens de contagens não finalizadas"
  ON contagens_estoque_itens FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contagens_estoque
      WHERE id = contagem_id AND status = 'em_andamento'
    )
  );

-- Políticas para contagens_estoque_ajustes
CREATE POLICY "Usuários autenticados podem visualizar ajustes"
  ON contagens_estoque_ajustes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar ajustes"
  ON contagens_estoque_ajustes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Função para finalizar contagem (calcula totais)
CREATE OR REPLACE FUNCTION finalizar_contagem_estoque(p_contagem_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_itens integer;
  v_total_diferencas integer;
  v_valor_total decimal(15,2);
  v_result json;
BEGIN
  -- Calcular totais
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE diferenca != 0),
    COALESCE(SUM(valor_diferenca), 0)
  INTO v_total_itens, v_total_diferencas, v_valor_total
  FROM contagens_estoque_itens
  WHERE contagem_id = p_contagem_id;

  -- Atualizar contagem
  UPDATE contagens_estoque
  SET
    status = 'finalizada',
    finalizado_em = now(),
    total_itens_contados = v_total_itens,
    total_diferencas = v_total_diferencas,
    valor_total_diferencas = v_valor_total
  WHERE id = p_contagem_id
    AND status = 'em_andamento';

  -- Retornar resultado
  SELECT json_build_object(
    'success', true,
    'total_itens', v_total_itens,
    'total_diferencas', v_total_diferencas,
    'valor_total_diferencas', v_valor_total
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Função para processar ajustes da contagem
CREATE OR REPLACE FUNCTION processar_contagem_estoque(
  p_contagem_id uuid,
  p_usuario_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_movimentacao_id uuid;
  v_total_ajustes integer := 0;
  v_contagem RECORD;
BEGIN
  -- Buscar dados da contagem
  SELECT * INTO v_contagem
  FROM contagens_estoque
  WHERE id = p_contagem_id AND status = 'finalizada';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada ou não finalizada');
  END IF;

  -- Processar cada item com diferença
  FOR v_item IN
    SELECT
      ci.*,
      ie.nome as item_nome,
      ie.codigo as item_codigo
    FROM contagens_estoque_itens ci
    JOIN itens_estoque ie ON ie.id = ci.item_estoque_id
    WHERE ci.contagem_id = p_contagem_id
      AND ci.diferenca != 0
  LOOP
    -- Criar movimentação de ajuste
    INSERT INTO movimentacoes_estoque (
      estoque_id,
      item_estoque_id,
      tipo_movimentacao,
      quantidade,
      valor_unitario,
      valor_total,
      data_movimentacao,
      origem,
      descricao,
      criado_por
    ) VALUES (
      v_contagem.estoque_id,
      v_item.item_estoque_id,
      CASE
        WHEN v_item.diferenca > 0 THEN 'entrada'
        ELSE 'saida'
      END,
      ABS(v_item.diferenca),
      v_item.valor_unitario,
      ABS(v_item.valor_diferenca),
      now(),
      'ajuste_contagem',
      format('Ajuste de contagem - %s (%s) - Diferença: %s',
        v_item.item_nome,
        v_item.item_codigo,
        v_item.diferenca
      ),
      p_usuario_id
    )
    RETURNING id INTO v_movimentacao_id;

    -- Registrar ajuste
    INSERT INTO contagens_estoque_ajustes (
      contagem_id,
      contagem_item_id,
      tipo_ajuste,
      quantidade_ajustada,
      motivo,
      movimentacao_id,
      criado_por
    ) VALUES (
      p_contagem_id,
      v_item.id,
      CASE
        WHEN v_item.diferenca > 0 THEN 'sobra'
        ELSE 'perda'
      END,
      ABS(v_item.diferenca),
      COALESCE(v_item.observacao, 'Ajuste automático por contagem de estoque'),
      v_movimentacao_id,
      p_usuario_id
    );

    v_total_ajustes := v_total_ajustes + 1;
  END LOOP;

  -- Atualizar status da contagem
  UPDATE contagens_estoque
  SET
    status = 'processada',
    processado_em = now()
  WHERE id = p_contagem_id;

  RETURN json_build_object(
    'success', true,
    'total_ajustes', v_total_ajustes,
    'message', format('%s ajustes processados com sucesso', v_total_ajustes)
  );
END;
$$;

-- Função para reabrir contagem (reconferir)
CREATE OR REPLACE FUNCTION reabrir_contagem_estoque(p_contagem_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE contagens_estoque
  SET
    status = 'em_andamento',
    finalizado_em = NULL,
    total_itens_contados = 0,
    total_diferencas = 0,
    valor_total_diferencas = 0
  WHERE id = p_contagem_id
    AND status = 'finalizada';

  IF FOUND THEN
    RETURN json_build_object('success', true, 'message', 'Contagem reaberta para reconferência');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Contagem não pode ser reaberta');
  END IF;
END;
$$;
