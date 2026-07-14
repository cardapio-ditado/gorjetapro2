/*
  # Sistema de Monitoramento de Férias com IA

  1. Nova Tabela: periodos_aquisitivos_ferias
    - Controla períodos aquisitivos de cada colaborador
    - Calcula automaticamente datas de início e fim do gozo
    
  2. Nova Tabela: alertas_ferias
    - Armazena alertas gerados pela IA
    - Notifica sobre prazos próximos ao vencimento
    
  3. Função: calcular_periodos_aquisitivos
    - Gera automaticamente períodos aquisitivos baseados na data de admissão
    
  4. View: vw_alertas_ferias_pendentes
    - Visualização consolidada dos alertas ativos
*/

-- Tabela de períodos aquisitivos
CREATE TABLE IF NOT EXISTS periodos_aquisitivos_ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  periodo_aquisitivo_inicio date NOT NULL,
  periodo_aquisitivo_fim date NOT NULL,
  periodo_concessivo_inicio date NOT NULL,
  periodo_concessivo_fim date NOT NULL,
  dias_direito integer DEFAULT 30,
  dias_gozados integer DEFAULT 0,
  dias_restantes integer GENERATED ALWAYS AS (dias_direito - dias_gozados) STORED,
  status text DEFAULT 'pendente' CHECK (status IN ('pendente', 'parcial', 'completo', 'vencido')),
  observacoes text,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now()
);

-- Tabela de alertas de férias
CREATE TABLE IF NOT EXISTS alertas_ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  periodo_aquisitivo_id uuid REFERENCES periodos_aquisitivos_ferias(id) ON DELETE CASCADE,
  tipo_alerta text NOT NULL CHECK (tipo_alerta IN ('periodo_aquisitivo_finalizando', 'periodo_concessivo_vencendo', 'ferias_vencidas')),
  prioridade text DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  data_alerta date NOT NULL,
  dias_ate_vencimento integer,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'resolvido', 'ignorado')),
  analise_ia jsonb,
  resolvido_em timestamp with time zone,
  resolvido_por uuid REFERENCES usuarios(id),
  criado_em timestamp with time zone DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_periodos_aquisitivos_colaborador ON periodos_aquisitivos_ferias(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_periodos_aquisitivos_status ON periodos_aquisitivos_ferias(status);
CREATE INDEX IF NOT EXISTS idx_periodos_aquisitivos_fim_concessivo ON periodos_aquisitivos_ferias(periodo_concessivo_fim);
CREATE INDEX IF NOT EXISTS idx_alertas_ferias_colaborador ON alertas_ferias(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_alertas_ferias_status ON alertas_ferias(status);
CREATE INDEX IF NOT EXISTS idx_alertas_ferias_prioridade ON alertas_ferias(prioridade);

-- Habilitar RLS
ALTER TABLE periodos_aquisitivos_ferias ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_ferias ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Allow all for periodos_aquisitivos_ferias"
  ON periodos_aquisitivos_ferias FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for alertas_ferias"
  ON alertas_ferias FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Função para calcular períodos aquisitivos automaticamente
CREATE OR REPLACE FUNCTION calcular_periodos_aquisitivos(p_colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_data_admissao date;
  v_data_atual date := CURRENT_DATE;
  v_periodo_inicio date;
  v_periodo_fim date;
  v_concessivo_inicio date;
  v_concessivo_fim date;
  v_anos_completos integer;
BEGIN
  -- Buscar data de admissão
  SELECT data_admissao INTO v_data_admissao
  FROM colaboradores
  WHERE id = p_colaborador_id;

  IF v_data_admissao IS NULL THEN
    RETURN;
  END IF;

  -- Calcular quantos anos completos desde a admissão
  v_anos_completos := EXTRACT(YEAR FROM AGE(v_data_atual, v_data_admissao));

  -- Gerar períodos aquisitivos para cada ano
  FOR i IN 0..v_anos_completos LOOP
    v_periodo_inicio := v_data_admissao + (i || ' years')::interval;
    v_periodo_fim := v_periodo_inicio + interval '1 year' - interval '1 day';
    v_concessivo_inicio := v_periodo_fim + interval '1 day';
    v_concessivo_fim := v_concessivo_inicio + interval '1 year' - interval '1 day';

    -- Inserir período se não existir
    INSERT INTO periodos_aquisitivos_ferias (
      colaborador_id,
      periodo_aquisitivo_inicio,
      periodo_aquisitivo_fim,
      periodo_concessivo_inicio,
      periodo_concessivo_fim,
      status
    )
    VALUES (
      p_colaborador_id,
      v_periodo_inicio,
      v_periodo_fim,
      v_concessivo_inicio,
      v_concessivo_fim,
      CASE
        WHEN v_data_atual > v_concessivo_fim THEN 'vencido'
        WHEN v_data_atual > v_periodo_fim THEN 'pendente'
        ELSE 'pendente'
      END
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Função para atualizar status dos períodos aquisitivos
CREATE OR REPLACE FUNCTION atualizar_status_periodos_aquisitivos()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE periodos_aquisitivos_ferias
  SET 
    status = CASE
      WHEN dias_restantes = 0 THEN 'completo'
      WHEN dias_restantes > 0 AND dias_restantes < dias_direito THEN 'parcial'
      WHEN CURRENT_DATE > periodo_concessivo_fim AND dias_restantes > 0 THEN 'vencido'
      ELSE 'pendente'
    END,
    atualizado_em = now()
  WHERE status != 'completo' OR CURRENT_DATE > periodo_concessivo_fim;
END;
$$;

-- Função para gerar alertas automáticos
CREATE OR REPLACE FUNCTION gerar_alertas_ferias()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_periodo RECORD;
  v_dias_ate_vencimento integer;
  v_prioridade text;
  v_titulo text;
  v_mensagem text;
BEGIN
  -- Limpar alertas antigos resolvidos (mais de 90 dias)
  DELETE FROM alertas_ferias
  WHERE status = 'resolvido'
    AND resolvido_em < CURRENT_DATE - interval '90 days';

  -- Gerar alertas para períodos próximos ao vencimento
  FOR v_periodo IN
    SELECT 
      paf.*,
      c.nome_completo,
      c.funcao_personalizada
    FROM periodos_aquisitivos_ferias paf
    JOIN colaboradores c ON c.id = paf.colaborador_id
    WHERE paf.status IN ('pendente', 'parcial')
      AND paf.dias_restantes > 0
      AND c.status = 'ativo'
  LOOP
    v_dias_ate_vencimento := paf.periodo_concessivo_fim - CURRENT_DATE;

    -- Determinar prioridade baseada nos dias restantes
    IF v_dias_ate_vencimento <= 15 THEN
      v_prioridade := 'urgente';
    ELSIF v_dias_ate_vencimento <= 30 THEN
      v_prioridade := 'alta';
    ELSIF v_dias_ate_vencimento <= 60 THEN
      v_prioridade := 'media';
    ELSE
      v_prioridade := 'baixa';
    END IF;

    -- Criar título e mensagem do alerta
    v_titulo := format('Férias vencendo em %s dias - %s', v_dias_ate_vencimento, v_periodo.nome_completo);
    v_mensagem := format(
      'O colaborador %s (%s) possui %s dias de férias restantes do período aquisitivo %s a %s. O prazo para gozo termina em %s (%s dias).',
      v_periodo.nome_completo,
      v_periodo.funcao_personalizada,
      v_periodo.dias_restantes,
      to_char(v_periodo.periodo_aquisitivo_inicio, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_aquisitivo_fim, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_concessivo_fim, 'DD/MM/YYYY'),
      v_dias_ate_vencimento
    );

    -- Inserir alerta se não existir um ativo para este período
    INSERT INTO alertas_ferias (
      colaborador_id,
      periodo_aquisitivo_id,
      tipo_alerta,
      prioridade,
      titulo,
      mensagem,
      data_alerta,
      dias_ate_vencimento
    )
    SELECT
      v_periodo.colaborador_id,
      v_periodo.id,
      'periodo_concessivo_vencendo',
      v_prioridade,
      v_titulo,
      v_mensagem,
      CURRENT_DATE,
      v_dias_ate_vencimento
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_ferias
      WHERE periodo_aquisitivo_id = v_periodo.id
        AND status = 'ativo'
        AND tipo_alerta = 'periodo_concessivo_vencendo'
    );
  END LOOP;

  -- Gerar alertas para férias já vencidas
  FOR v_periodo IN
    SELECT 
      paf.*,
      c.nome_completo,
      c.funcao_personalizada
    FROM periodos_aquisitivos_ferias paf
    JOIN colaboradores c ON c.id = paf.colaborador_id
    WHERE paf.status = 'vencido'
      AND paf.dias_restantes > 0
      AND c.status = 'ativo'
  LOOP
    v_dias_ate_vencimento := CURRENT_DATE - v_periodo.periodo_concessivo_fim;
    v_titulo := format('FÉRIAS VENCIDAS - %s', v_periodo.nome_completo);
    v_mensagem := format(
      'ATENÇÃO! O colaborador %s (%s) possui %s dias de férias VENCIDAS do período aquisitivo %s a %s. O prazo terminou em %s (há %s dias). Providências urgentes são necessárias.',
      v_periodo.nome_completo,
      v_periodo.funcao_personalizada,
      v_periodo.dias_restantes,
      to_char(v_periodo.periodo_aquisitivo_inicio, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_aquisitivo_fim, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_concessivo_fim, 'DD/MM/YYYY'),
      v_dias_ate_vencimento
    );

    INSERT INTO alertas_ferias (
      colaborador_id,
      periodo_aquisitivo_id,
      tipo_alerta,
      prioridade,
      titulo,
      mensagem,
      data_alerta,
      dias_ate_vencimento
    )
    SELECT
      v_periodo.colaborador_id,
      v_periodo.id,
      'ferias_vencidas',
      'urgente',
      v_titulo,
      v_mensagem,
      CURRENT_DATE,
      -v_dias_ate_vencimento
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_ferias
      WHERE periodo_aquisitivo_id = v_periodo.id
        AND status = 'ativo'
        AND tipo_alerta = 'ferias_vencidas'
    );
  END LOOP;
END;
$$;

-- View para visualizar alertas pendentes
CREATE OR REPLACE VIEW vw_alertas_ferias_pendentes AS
SELECT 
  af.id,
  af.colaborador_id,
  c.nome_completo,
  c.funcao_personalizada,
  af.tipo_alerta,
  af.prioridade,
  af.titulo,
  af.mensagem,
  af.data_alerta,
  af.dias_ate_vencimento,
  paf.periodo_aquisitivo_inicio,
  paf.periodo_aquisitivo_fim,
  paf.periodo_concessivo_fim,
  paf.dias_restantes,
  af.criado_em
FROM alertas_ferias af
JOIN colaboradores c ON c.id = af.colaborador_id
LEFT JOIN periodos_aquisitivos_ferias paf ON paf.id = af.periodo_aquisitivo_id
WHERE af.status = 'ativo'
  AND c.status = 'ativo'
ORDER BY 
  CASE af.prioridade
    WHEN 'urgente' THEN 1
    WHEN 'alta' THEN 2
    WHEN 'media' THEN 3
    ELSE 4
  END,
  af.dias_ate_vencimento;

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION update_periodos_aquisitivos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_periodos_aquisitivos_updated_at
  BEFORE UPDATE ON periodos_aquisitivos_ferias
  FOR EACH ROW
  EXECUTE FUNCTION update_periodos_aquisitivos_updated_at();
