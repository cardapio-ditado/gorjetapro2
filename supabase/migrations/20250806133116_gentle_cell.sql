/*
  # Módulo de RH Completo - Gestão de Bar

  1. New Tables
    - `colaboradores` - Cadastro completo de colaboradores
    - `escalas_trabalho` - Escalas de trabalho e folgas
    - `ferias_colaboradores` - Controle de férias
    - `ocorrencias_colaborador` - Ocorrências mensais (faltas, atestados, etc)
    - `extras_freelancers` - Freelancers e extras pontuais
    - `comissoes_garcom` - Comissões por garçom
    - `vendas_garcom` - Vendas diárias por garçom
    - `funcoes_rh` - Funções disponíveis
    - `configuracoes_rh` - Configurações do módulo

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users

  3. Enums
    - `tipo_vinculo_enum` - Tipos de vínculo trabalhista
    - `tipo_turno_enum` - Tipos de turno
    - `status_ferias_enum` - Status das férias
    - `tipo_ocorrencia_enum` - Tipos de ocorrência
    - `status_ocorrencia_rh_enum` - Status das ocorrências
*/

-- Enums
CREATE TYPE tipo_vinculo_enum AS ENUM ('clt', 'freelancer', 'prestador');
CREATE TYPE tipo_turno_enum AS ENUM ('diurno', 'noturno', 'madrugada', 'variavel');
CREATE TYPE status_ferias_enum AS ENUM ('previsto', 'solicitado', 'aprovado', 'gozado', 'cancelado');
CREATE TYPE tipo_ocorrencia_enum AS ENUM ('falta', 'atestado', 'vale', 'advertencia', 'atraso', 'observacao');
CREATE TYPE status_ocorrencia_rh_enum AS ENUM ('pendente', 'aprovado', 'rejeitado', 'processado');

-- Tabela de Funções
CREATE TABLE IF NOT EXISTS funcoes_rh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  salario_base numeric(10,2) DEFAULT 0,
  percentual_comissao numeric(5,2) DEFAULT 0,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid
);

-- Tabela de Colaboradores
CREATE TABLE IF NOT EXISTS colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  cpf text,
  rg text,
  data_nascimento date,
  funcao_id uuid REFERENCES funcoes_rh(id),
  funcao_personalizada text,
  tipo_vinculo tipo_vinculo_enum DEFAULT 'clt',
  data_admissao date DEFAULT CURRENT_DATE,
  data_demissao date,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'afastado', 'demitido')),
  salario_fixo numeric(10,2) DEFAULT 0,
  valor_diaria numeric(10,2) DEFAULT 0,
  percentual_comissao numeric(5,2) DEFAULT 0,
  foto_url text,
  telefone text,
  email text,
  endereco text,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid
);

-- Tabela de Escalas de Trabalho
CREATE TABLE IF NOT EXISTS escalas_trabalho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_escala date NOT NULL,
  horario_inicio time,
  horario_fim time,
  tipo_turno tipo_turno_enum DEFAULT 'diurno',
  setor text NOT NULL,
  eh_folga boolean DEFAULT false,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid,
  UNIQUE(colaborador_id, data_escala)
);

-- Tabela de Férias
CREATE TABLE IF NOT EXISTS ferias_colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  dias_corridos integer NOT NULL,
  dias_uteis integer NOT NULL,
  data_prevista_retorno date,
  status status_ferias_enum DEFAULT 'previsto',
  data_solicitacao timestamptz,
  data_aprovacao timestamptz,
  aprovado_por uuid,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid
);

-- Tabela de Ocorrências
CREATE TABLE IF NOT EXISTS ocorrencias_colaborador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_ocorrencia date NOT NULL,
  tipo_ocorrencia tipo_ocorrencia_enum NOT NULL,
  descricao text NOT NULL,
  valor_vale numeric(10,2) DEFAULT 0,
  dias_afastamento integer DEFAULT 0,
  documento_anexo text,
  status status_ocorrencia_rh_enum DEFAULT 'pendente',
  aprovado_por uuid,
  data_aprovacao timestamptz,
  observacoes_aprovacao text,
  impacta_folha boolean DEFAULT false,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid
);

-- Tabela de Extras/Freelancers
CREATE TABLE IF NOT EXISTS extras_freelancers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  telefone text,
  funcao_temporaria text NOT NULL,
  valor_diaria numeric(10,2) NOT NULL,
  data_trabalho date NOT NULL,
  horario_inicio time,
  horario_fim time,
  setor text NOT NULL,
  motivo_contratacao text,
  evento_id uuid,
  observacoes text,
  status_pagamento text DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente', 'pago', 'cancelado')),
  data_pagamento date,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid
);

-- Tabela de Vendas por Garçom
CREATE TABLE IF NOT EXISTS vendas_garcom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_venda date NOT NULL,
  turno text NOT NULL,
  valor_vendas numeric(10,2) NOT NULL DEFAULT 0,
  quantidade_comandas integer DEFAULT 0,
  valor_gorjeta numeric(10,2) DEFAULT 0,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid,
  UNIQUE(colaborador_id, data_venda, turno)
);

-- Tabela de Comissões
CREATE TABLE IF NOT EXISTS comissoes_garcom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  venda_id uuid NOT NULL REFERENCES vendas_garcom(id) ON DELETE CASCADE,
  data_calculo date NOT NULL,
  valor_base numeric(10,2) NOT NULL,
  percentual_aplicado numeric(5,2) NOT NULL,
  valor_comissao numeric(10,2) NOT NULL,
  status_pagamento text DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente', 'pago', 'cancelado')),
  data_pagamento date,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid
);

-- Tabela de Configurações do RH
CREATE TABLE IF NOT EXISTS configuracoes_rh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  valor text NOT NULL,
  descricao text,
  tipo text DEFAULT 'texto' CHECK (tipo IN ('texto', 'numero', 'boolean', 'data')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid
);

-- Inserir configurações padrão
INSERT INTO configuracoes_rh (chave, valor, descricao, tipo) VALUES
('dias_alerta_folga', '7', 'Dias para alertar colaborador sem folga', 'numero'),
('dias_ferias_direito', '30', 'Dias de férias por ano', 'numero'),
('percentual_comissao_padrao', '5.0', 'Percentual de comissão padrão para garçons', 'numero'),
('horario_inicio_diurno', '06:00', 'Horário de início do turno diurno', 'texto'),
('horario_fim_diurno', '14:00', 'Horário de fim do turno diurno', 'texto'),
('horario_inicio_noturno', '14:00', 'Horário de início do turno noturno', 'texto'),
('horario_fim_noturno', '22:00', 'Horário de fim do turno noturno', 'texto'),
('horario_inicio_madrugada', '22:00', 'Horário de início do turno madrugada', 'texto'),
('horario_fim_madrugada', '06:00', 'Horário de fim do turno madrugada', 'texto')
ON CONFLICT (chave) DO NOTHING;

-- Inserir funções padrão
INSERT INTO funcoes_rh (nome, descricao, salario_base, percentual_comissao) VALUES
('Gerente', 'Gerente geral do estabelecimento', 5000.00, 0),
('Supervisor', 'Supervisor de operações', 3500.00, 0),
('Garçom', 'Atendimento ao cliente', 1800.00, 5.0),
('Bartender', 'Preparo de bebidas', 2200.00, 3.0),
('Churrasqueiro', 'Preparo de carnes', 2500.00, 0),
('Cozinheiro', 'Preparo de alimentos', 2000.00, 0),
('Auxiliar de Cozinha', 'Apoio na cozinha', 1500.00, 0),
('Caixa', 'Operação do caixa', 1600.00, 0),
('Segurança', 'Segurança do estabelecimento', 1800.00, 0),
('Limpeza', 'Limpeza e organização', 1400.00, 0),
('Recepcionista', 'Recepção de clientes', 1600.00, 0),
('Manobrista', 'Estacionamento', 1300.00, 0)
ON CONFLICT DO NOTHING;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_colaboradores_status ON colaboradores(status);
CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao ON colaboradores(funcao_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_tipo_vinculo ON colaboradores(tipo_vinculo);
CREATE INDEX IF NOT EXISTS idx_escalas_data ON escalas_trabalho(data_escala);
CREATE INDEX IF NOT EXISTS idx_escalas_colaborador ON escalas_trabalho(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_escalas_setor ON escalas_trabalho(setor);
CREATE INDEX IF NOT EXISTS idx_ferias_colaborador ON ferias_colaboradores(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ferias_status ON ferias_colaboradores(status);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_colaborador ON ocorrencias_colaborador(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias_colaborador(data_ocorrencia);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_tipo ON ocorrencias_colaborador(tipo_ocorrencia);
CREATE INDEX IF NOT EXISTS idx_vendas_garcom_data ON vendas_garcom(data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_garcom_colaborador ON vendas_garcom(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_colaborador ON comissoes_garcom(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_data ON comissoes_garcom(data_calculo);

-- Enable RLS
ALTER TABLE funcoes_rh ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalas_trabalho ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferias_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE extras_freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_garcom ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissoes_garcom ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_rh ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all operations on funcoes_rh"
  ON funcoes_rh
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on colaboradores"
  ON colaboradores
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on escalas_trabalho"
  ON escalas_trabalho
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on ferias_colaboradores"
  ON ferias_colaboradores
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on ocorrencias_colaborador"
  ON ocorrencias_colaborador
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on extras_freelancers"
  ON extras_freelancers
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on vendas_garcom"
  ON vendas_garcom
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on comissoes_garcom"
  ON comissoes_garcom
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on configuracoes_rh"
  ON configuracoes_rh
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Views para relatórios

-- View de colaboradores com dados completos
CREATE OR REPLACE VIEW vw_colaboradores_completo AS
SELECT 
  c.*,
  f.nome as funcao_nome,
  f.salario_base as funcao_salario_base,
  f.percentual_comissao as funcao_percentual_comissao,
  CASE 
    WHEN c.data_admissao IS NOT NULL 
    THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.data_admissao))
    ELSE 0 
  END as anos_empresa,
  CASE 
    WHEN c.data_admissao IS NOT NULL 
    THEN c.data_admissao + INTERVAL '1 year'
    ELSE NULL 
  END as data_ferias_prevista
FROM colaboradores c
LEFT JOIN funcoes_rh f ON c.funcao_id = f.id;

-- View de escalas com dados do colaborador
CREATE OR REPLACE VIEW vw_escalas_detalhadas AS
SELECT 
  e.*,
  c.nome_completo as colaborador_nome,
  c.funcao_personalizada,
  f.nome as funcao_nome,
  CASE 
    WHEN e.eh_folga THEN 'Folga'
    ELSE CONCAT(e.horario_inicio::text, ' - ', e.horario_fim::text)
  END as horario_formatado,
  EXTRACT(DOW FROM e.data_escala) as dia_semana
FROM escalas_trabalho e
INNER JOIN colaboradores c ON e.colaborador_id = c.id
LEFT JOIN funcoes_rh f ON c.funcao_id = f.id;

-- View de férias com dados do colaborador
CREATE OR REPLACE VIEW vw_ferias_detalhadas AS
SELECT 
  f.*,
  c.nome_completo as colaborador_nome,
  c.data_admissao,
  fn.nome as funcao_nome,
  CASE 
    WHEN f.data_fim < CURRENT_DATE AND f.status = 'aprovado' THEN 'vencido'
    ELSE f.status::text
  END as status_atual,
  CURRENT_DATE - f.data_fim as dias_vencimento
FROM ferias_colaboradores f
INNER JOIN colaboradores c ON f.colaborador_id = c.id
LEFT JOIN funcoes_rh fn ON c.funcao_id = fn.id;

-- View de ocorrências com dados do colaborador
CREATE OR REPLACE VIEW vw_ocorrencias_detalhadas AS
SELECT 
  o.*,
  c.nome_completo as colaborador_nome,
  c.funcao_personalizada,
  f.nome as funcao_nome,
  EXTRACT(MONTH FROM o.data_ocorrencia) as mes_ocorrencia,
  EXTRACT(YEAR FROM o.data_ocorrencia) as ano_ocorrencia
FROM ocorrencias_colaborador o
INNER JOIN colaboradores c ON o.colaborador_id = c.id
LEFT JOIN funcoes_rh f ON c.funcao_id = f.id;

-- View de comissões com dados completos
CREATE OR REPLACE VIEW vw_comissoes_detalhadas AS
SELECT 
  cm.*,
  c.nome_completo as colaborador_nome,
  v.data_venda,
  v.turno,
  v.valor_vendas,
  v.quantidade_comandas,
  v.valor_gorjeta,
  f.nome as funcao_nome,
  EXTRACT(MONTH FROM cm.data_calculo) as mes_comissao,
  EXTRACT(YEAR FROM cm.data_calculo) as ano_comissao
FROM comissoes_garcom cm
INNER JOIN colaboradores c ON cm.colaborador_id = c.id
INNER JOIN vendas_garcom v ON cm.venda_id = v.id
LEFT JOIN funcoes_rh f ON c.funcao_id = f.id;

-- View de indicadores de RH
CREATE OR REPLACE VIEW vw_indicadores_rh AS
SELECT 
  (SELECT COUNT(*) FROM colaboradores WHERE status = 'ativo') as colaboradores_ativos,
  (SELECT COUNT(*) FROM colaboradores WHERE status = 'inativo') as colaboradores_inativos,
  (SELECT COUNT(*) FROM colaboradores) as total_colaboradores,
  (SELECT COUNT(*) FROM escalas_trabalho WHERE data_escala >= date_trunc('month', CURRENT_DATE)) as escalas_mes_atual,
  (SELECT COUNT(DISTINCT setor) FROM escalas_trabalho WHERE data_escala >= date_trunc('month', CURRENT_DATE)) as setores_ativos,
  (SELECT COUNT(*) FROM ferias_colaboradores WHERE status = 'aprovado' AND data_inicio <= CURRENT_DATE AND data_fim >= CURRENT_DATE) as colaboradores_ferias,
  (SELECT COUNT(*) FROM ocorrencias_colaborador WHERE data_ocorrencia >= date_trunc('month', CURRENT_DATE)) as ocorrencias_mes,
  (SELECT COALESCE(SUM(valor_comissao), 0) FROM comissoes_garcom WHERE data_calculo >= date_trunc('month', CURRENT_DATE)) as comissoes_mes,
  (SELECT COALESCE(SUM(valor_diaria), 0) FROM extras_freelancers WHERE data_trabalho >= date_trunc('month', CURRENT_DATE)) as extras_mes,
  (SELECT COUNT(*) FROM colaboradores c WHERE NOT EXISTS (
    SELECT 1 FROM escalas_trabalho e 
    WHERE e.colaborador_id = c.id 
    AND e.eh_folga = true 
    AND e.data_escala >= CURRENT_DATE - INTERVAL '7 days'
    AND c.status = 'ativo'
  )) as colaboradores_sem_folga_7_dias;

-- View de alertas de RH
CREATE OR REPLACE VIEW vw_alertas_rh AS
SELECT 
  'folga' as tipo_alerta,
  c.id as colaborador_id,
  c.nome_completo as colaborador_nome,
  'Colaborador sem folga há mais de 7 dias' as mensagem,
  'alta' as prioridade,
  CURRENT_DATE as data_alerta
FROM colaboradores c
WHERE c.status = 'ativo'
AND NOT EXISTS (
  SELECT 1 FROM escalas_trabalho e 
  WHERE e.colaborador_id = c.id 
  AND e.eh_folga = true 
  AND e.data_escala >= CURRENT_DATE - INTERVAL '7 days'
)

UNION ALL

SELECT 
  'ferias' as tipo_alerta,
  c.id as colaborador_id,
  c.nome_completo as colaborador_nome,
  'Férias vencidas ou próximas do vencimento' as mensagem,
  'media' as prioridade,
  CURRENT_DATE as data_alerta
FROM colaboradores c
WHERE c.status = 'ativo'
AND c.data_admissao <= CURRENT_DATE - INTERVAL '11 months'
AND NOT EXISTS (
  SELECT 1 FROM ferias_colaboradores f 
  WHERE f.colaborador_id = c.id 
  AND f.status = 'gozado'
  AND f.data_inicio >= CURRENT_DATE - INTERVAL '1 year'
)

UNION ALL

SELECT 
  'ocorrencia' as tipo_alerta,
  c.id as colaborador_id,
  c.nome_completo as colaborador_nome,
  'Colaborador com muitas faltas no mês' as mensagem,
  'alta' as prioridade,
  CURRENT_DATE as data_alerta
FROM colaboradores c
WHERE c.status = 'ativo'
AND (
  SELECT COUNT(*) FROM ocorrencias_colaborador o 
  WHERE o.colaborador_id = c.id 
  AND o.tipo_ocorrencia = 'falta'
  AND o.data_ocorrencia >= date_trunc('month', CURRENT_DATE)
) >= 3;

-- Triggers para atualizar timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp_rh()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_colaboradores_update
  BEFORE UPDATE ON colaboradores
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_rh();

CREATE TRIGGER trg_escalas_update
  BEFORE UPDATE ON escalas_trabalho
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_rh();

CREATE TRIGGER trg_ferias_update
  BEFORE UPDATE ON ferias_colaboradores
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_rh();

CREATE TRIGGER trg_ocorrencias_update
  BEFORE UPDATE ON ocorrencias_colaborador
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_rh();

CREATE TRIGGER trg_extras_update
  BEFORE UPDATE ON extras_freelancers
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_rh();

CREATE TRIGGER trg_vendas_update
  BEFORE UPDATE ON vendas_garcom
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_rh();

CREATE TRIGGER trg_comissoes_update
  BEFORE UPDATE ON comissoes_garcom
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_rh();

-- Trigger para calcular comissões automaticamente
CREATE OR REPLACE FUNCTION calcular_comissao_automatica()
RETURNS TRIGGER AS $$
DECLARE
  percentual_comissao numeric(5,2);
  valor_comissao numeric(10,2);
BEGIN
  -- Buscar percentual de comissão do colaborador
  SELECT 
    COALESCE(c.percentual_comissao, f.percentual_comissao, 0)
  INTO percentual_comissao
  FROM colaboradores c
  LEFT JOIN funcoes_rh f ON c.funcao_id = f.id
  WHERE c.id = NEW.colaborador_id;

  -- Calcular comissão se percentual > 0
  IF percentual_comissao > 0 THEN
    valor_comissao := (NEW.valor_vendas * percentual_comissao / 100);
    
    -- Inserir registro de comissão
    INSERT INTO comissoes_garcom (
      colaborador_id,
      venda_id,
      data_calculo,
      valor_base,
      percentual_aplicado,
      valor_comissao,
      status_pagamento
    ) VALUES (
      NEW.colaborador_id,
      NEW.id,
      NEW.data_venda,
      NEW.valor_vendas,
      percentual_comissao,
      valor_comissao,
      'pendente'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calcular_comissao
  AFTER INSERT ON vendas_garcom
  FOR EACH ROW EXECUTE FUNCTION calcular_comissao_automatica();