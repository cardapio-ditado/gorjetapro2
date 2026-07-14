/*
  # Melhorias Sistema de Despesas - Visão Estratégica
  
  ## Problemas Resolvidos
  1. **Ordem das categorias**: Sincronizar com ordem do DRE (alfabética por categoria raiz)
  2. **Despesas futuras manuais**: Atribuir automaticamente à semana baseado em data_vencimento
  3. **Despesas pagas no dia**: Atribuir à semana corrente automaticamente
  4. **Diferenciação previsão vs realizada**: Novo campo `tipo_lancamento`
  
  ## Mudanças
  1. Adicionar campo `tipo_lancamento` ('previsao', 'realizada', 'confirmada')
  2. Criar trigger para atribuir semana automaticamente baseado em data_vencimento
  3. Atualizar função get_categorias para usar ordem alfabética (igual DRE)
  4. Criar função para confirmar previsões
  5. Adicionar campo `data_confirmacao` e `confirmado_por`
  
  ## Segurança
  - RLS já configurado nas tabelas existentes
*/

-- 1. Adicionar novos campos na tabela de despesas
ALTER TABLE visao_estrategica_despesas
  ADD COLUMN IF NOT EXISTS tipo_lancamento text DEFAULT 'previsao' 
    CHECK (tipo_lancamento IN ('previsao', 'realizada', 'confirmada'));

ALTER TABLE visao_estrategica_despesas
  ADD COLUMN IF NOT EXISTS data_confirmacao timestamptz;

ALTER TABLE visao_estrategica_despesas
  ADD COLUMN IF NOT EXISTS confirmado_por uuid REFERENCES auth.users(id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ve_despesas_tipo_lancamento 
  ON visao_estrategica_despesas(tipo_lancamento);

CREATE INDEX IF NOT EXISTS idx_ve_despesas_data_vencimento 
  ON visao_estrategica_despesas(data_vencimento);

-- 2. Função para encontrar semana baseado em uma data
-- Cada semana começa no domingo e vai até sábado (7 dias)
CREATE OR REPLACE FUNCTION get_semana_por_data(p_data date)
RETURNS uuid AS $$
DECLARE
  v_semana_id uuid;
  v_data_fim date;
BEGIN
  -- Buscar semana que contém a data fornecida
  -- Considera que cada semana tem 7 dias a partir de data_inicio
  SELECT id INTO v_semana_id
  FROM visao_estrategica_semanas
  WHERE p_data >= data_inicio 
    AND p_data < data_inicio + INTERVAL '7 days'
  ORDER BY data_inicio DESC
  LIMIT 1;
  
  RETURN v_semana_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger para atribuir semana automaticamente baseado em data_vencimento
CREATE OR REPLACE FUNCTION atribuir_semana_despesa_ve()
RETURNS TRIGGER AS $$
DECLARE
  v_semana_id uuid;
  v_data_ref date;
BEGIN
  -- Se já tem semana_id definida manualmente, não alterar
  IF NEW.semana_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Se tem data_vencimento, usar ela; senão usar data atual
  v_data_ref := COALESCE(NEW.data_vencimento, CURRENT_DATE);
  
  -- Buscar semana correspondente
  v_semana_id := get_semana_por_data(v_data_ref);
  
  -- Atribuir semana encontrada (pode ser NULL se não houver semana cadastrada)
  NEW.semana_id := v_semana_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_atribuir_semana_despesa ON visao_estrategica_despesas;

CREATE TRIGGER trigger_atribuir_semana_despesa
  BEFORE INSERT OR UPDATE ON visao_estrategica_despesas
  FOR EACH ROW
  EXECUTE FUNCTION atribuir_semana_despesa_ve();

-- 4. Função para confirmar uma previsão (transforma em confirmada)
CREATE OR REPLACE FUNCTION confirmar_previsao_despesa(
  p_despesa_id uuid
) RETURNS json AS $$
DECLARE
  v_despesa visao_estrategica_despesas;
  v_user_id uuid;
BEGIN
  -- Buscar usuário atual
  v_user_id := auth.uid();
  
  -- Buscar despesa
  SELECT * INTO v_despesa
  FROM visao_estrategica_despesas
  WHERE id = p_despesa_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada';
  END IF;
  
  -- Validar se é previsão
  IF v_despesa.tipo_lancamento != 'previsao' THEN
    RAISE EXCEPTION 'Apenas despesas do tipo previsão podem ser confirmadas';
  END IF;
  
  -- Confirmar previsão
  UPDATE visao_estrategica_despesas
  SET 
    tipo_lancamento = 'confirmada',
    data_confirmacao = NOW(),
    confirmado_por = v_user_id
  WHERE id = p_despesa_id;
  
  RETURN json_build_object(
    'despesa_id', p_despesa_id,
    'tipo_anterior', 'previsao',
    'tipo_novo', 'confirmada',
    'confirmado_em', NOW(),
    'confirmado_por', v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função para converter despesa confirmada em conta a pagar
CREATE OR REPLACE FUNCTION converter_despesa_em_conta_pagar(
  p_despesa_id uuid,
  p_fornecedor_id uuid
) RETURNS json AS $$
DECLARE
  v_despesa visao_estrategica_despesas;
  v_conta_pagar_id uuid;
  v_user_id uuid;
  v_centro_custo_id uuid;
BEGIN
  -- Buscar usuário atual
  v_user_id := auth.uid();
  
  -- Buscar despesa
  SELECT * INTO v_despesa
  FROM visao_estrategica_despesas
  WHERE id = p_despesa_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada';
  END IF;
  
  -- Validar se pode converter
  IF v_despesa.status = 'convertida' THEN
    RAISE EXCEPTION 'Despesa já foi convertida';
  END IF;
  
  IF v_despesa.conta_pagar_id IS NOT NULL THEN
    RAISE EXCEPTION 'Despesa já possui vínculo com conta a pagar';
  END IF;
  
  -- Buscar centro de custo padrão
  SELECT id INTO v_centro_custo_id
  FROM centros_custo
  WHERE ativo = true
  LIMIT 1;
  
  -- Criar conta a pagar
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    valor_total,
    data_vencimento,
    categoria_id,
    centro_custo_id,
    status
  ) VALUES (
    p_fornecedor_id,
    COALESCE(v_despesa.descricao, v_despesa.fornecedor) || ' (Convertido de Previsão VE)',
    v_despesa.valor,
    COALESCE(v_despesa.data_vencimento, CURRENT_DATE),
    v_despesa.categoria_financeira_id,
    v_centro_custo_id,
    'em_aberto'
  ) RETURNING id INTO v_conta_pagar_id;
  
  -- Atualizar despesa
  UPDATE visao_estrategica_despesas
  SET 
    status = 'convertida',
    conta_pagar_id = v_conta_pagar_id,
    convertido_em = NOW(),
    convertido_por = v_user_id,
    observacao_conversao = 'Convertido automaticamente em conta a pagar'
  WHERE id = p_despesa_id;
  
  RETURN json_build_object(
    'despesa_id', p_despesa_id,
    'conta_pagar_id', v_conta_pagar_id,
    'convertido', true,
    'convertido_em', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Atualizar função de categorias para usar ordem alfabética (igual DRE)
CREATE OR REPLACE FUNCTION get_categorias_visao_estrategica()
RETURNS TABLE (
  id uuid,
  nome text,
  tipo text,
  percentual numeric,
  cor text,
  ordem integer,
  tem_filhas boolean,
  subcategorias jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH categorias_principais AS (
    SELECT 
      cf.id,
      cf.nome,
      cf.tipo,
      vc.percentual,
      vc.cor,
      vc.ordem,
      EXISTS(
        SELECT 1 FROM categorias_financeiras sub 
        WHERE sub.categoria_pai_id = cf.id 
        AND sub.status = 'ativo'
      ) as tem_filhas
    FROM categorias_financeiras cf
    INNER JOIN visao_estrategica_categorias_config vc ON cf.id = vc.categoria_financeira_id
    WHERE cf.tipo = 'despesa'
      AND cf.status = 'ativo'
      AND cf.categoria_pai_id IS NULL
      AND vc.ativo = true
  ),
  subcategorias_agregadas AS (
    SELECT 
      cp.id as categoria_pai_id,
      jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'nome', sub.nome,
          'percentual', COALESCE(subconfig.percentual, 0),
          'ordem', sub.ordem
        ) ORDER BY sub.nome
      ) as subs
    FROM categorias_principais cp
    INNER JOIN categorias_financeiras sub ON sub.categoria_pai_id = cp.id
    LEFT JOIN visao_estrategica_categorias_config subconfig ON sub.id = subconfig.categoria_financeira_id
    WHERE sub.status = 'ativo'
    GROUP BY cp.id
  )
  SELECT 
    cp.id,
    cp.nome,
    cp.tipo,
    cp.percentual,
    cp.cor,
    cp.ordem,
    cp.tem_filhas,
    COALESCE(sa.subs, '[]'::jsonb) as subcategorias
  FROM categorias_principais cp
  LEFT JOIN subcategorias_agregadas sa ON cp.id = sa.categoria_pai_id
  ORDER BY cp.nome;  -- ← ORDEM ALFABÉTICA (IGUAL DRE)
END;
$$;

-- 7. Atualizar despesas existentes para ter semana baseado em data_vencimento
UPDATE visao_estrategica_despesas
SET semana_id = get_semana_por_data(COALESCE(data_vencimento, CURRENT_DATE))
WHERE semana_id IS NULL
  AND status = 'ativa';

-- 8. Comentários
COMMENT ON COLUMN visao_estrategica_despesas.tipo_lancamento IS 
  'Tipo de lançamento: previsao (planejamento futuro), realizada (despesa manual confirmada), confirmada (previsão confirmada para execução)';

COMMENT ON COLUMN visao_estrategica_despesas.data_confirmacao IS 
  'Data em que a previsão foi confirmada';

COMMENT ON COLUMN visao_estrategica_despesas.confirmado_por IS 
  'Usuário que confirmou a previsão';

COMMENT ON FUNCTION get_semana_por_data IS 
  'Encontra a semana da Visão Estratégica que contém uma data específica (considera semanas de 7 dias)';

COMMENT ON FUNCTION confirmar_previsao_despesa IS 
  'Confirma uma previsão de despesa, marcando-a como confirmada e pronta para execução';

COMMENT ON FUNCTION converter_despesa_em_conta_pagar IS 
  'Converte uma despesa da Visão Estratégica em uma conta a pagar no sistema financeiro';
