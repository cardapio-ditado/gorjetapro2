/*
  # Módulo de Entradas - Previsto x Realizado (Inflows)
  
  ## Descrição
  Sistema para controlar o dinheiro ANTES dele alimentar o orçamento da semana.
  Permite lançar o que "deve entrar" (Previsto) e dar baixa no que "entrou de fato" (Realizado).
  Um botão enviará a soma do Realizado para atualizar o revenue da semana atual.
  
  ## Tabelas Criadas
  1. visao_estrategica_entradas - Entradas previstas e realizadas
  
  ## Funcionalidades
  - Registrar entradas previstas (expected)
  - Registrar entradas realizadas (actual)
  - Sincronizar total realizado com faturamento da semana
  - Visualizar gap entre previsto e realizado
  
  ## Segurança
  - RLS habilitado
  - Acesso para usuários autenticados
*/

-- Criar tabela de entradas (inflows)
CREATE TABLE IF NOT EXISTS visao_estrategica_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id uuid REFERENCES visao_estrategica_semanas(id) ON DELETE CASCADE NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('previsto', 'realizado')),
  descricao text NOT NULL,
  valor numeric NOT NULL CHECK (valor > 0),
  criado_em timestamptz DEFAULT NOW(),
  criado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_entradas_semana ON visao_estrategica_entradas(semana_id);
CREATE INDEX IF NOT EXISTS idx_entradas_tipo ON visao_estrategica_entradas(tipo);
CREATE INDEX IF NOT EXISTS idx_entradas_data ON visao_estrategica_entradas(criado_em);

-- RLS
ALTER TABLE visao_estrategica_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de entradas"
  ON visao_estrategica_entradas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Permitir criação de entradas"
  ON visao_estrategica_entradas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de entradas"
  ON visao_estrategica_entradas FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Permitir exclusão de entradas"
  ON visao_estrategica_entradas FOR DELETE
  TO authenticated
  USING (true);

-- Função para obter semana atual
CREATE OR REPLACE FUNCTION obter_semana_atual()
RETURNS uuid AS $$
DECLARE
  v_semana_id uuid;
  v_data_inicio date;
BEGIN
  -- Pega a data de início da semana atual (segunda-feira)
  v_data_inicio := date_trunc('week', CURRENT_DATE)::date;
  
  -- Busca ou cria a semana
  SELECT id INTO v_semana_id
  FROM visao_estrategica_semanas
  WHERE data_inicio = v_data_inicio;
  
  -- Se não existir, retorna null (deve criar via aplicação)
  RETURN v_semana_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Função para sincronizar entradas realizadas com faturamento da semana
CREATE OR REPLACE FUNCTION sincronizar_entradas_com_faturamento(p_semana_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_total_realizado numeric;
  v_result jsonb;
BEGIN
  -- Calcula total das entradas realizadas
  SELECT COALESCE(SUM(valor), 0)
  INTO v_total_realizado
  FROM visao_estrategica_entradas
  WHERE semana_id = p_semana_id
    AND tipo = 'realizado';
  
  -- Atualiza faturamento da semana
  UPDATE visao_estrategica_semanas
  SET faturamento = v_total_realizado,
      atualizado_em = NOW()
  WHERE id = p_semana_id;
  
  -- Retorna resultado
  v_result := jsonb_build_object(
    'semana_id', p_semana_id,
    'total_realizado', v_total_realizado,
    'sucesso', true,
    'mensagem', 'Faturamento atualizado com sucesso!'
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- View para facilitar consultas de entradas
CREATE OR REPLACE VIEW v_entradas_dashboard AS
SELECT 
  e.id,
  e.semana_id,
  e.tipo,
  e.descricao,
  e.valor,
  e.criado_em,
  e.criado_por,
  s.data_inicio,
  s.faturamento as faturamento_semana
FROM visao_estrategica_entradas e
LEFT JOIN visao_estrategica_semanas s ON s.id = e.semana_id
ORDER BY e.criado_em DESC;

-- Permitir acesso à view
GRANT SELECT ON v_entradas_dashboard TO authenticated;