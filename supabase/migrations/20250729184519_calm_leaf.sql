/*
  # Livro de Ocorrências - Sistema de Registro de Eventos Operacionais

  1. Nova Tabela
    - `ocorrencias`
      - `id` (uuid, primary key)
      - `data` (date, data da ocorrência)
      - `setor` (text, setor onde ocorreu)
      - `descricao` (text, descrição detalhada)
      - `acao_tomada` (text, ações tomadas)
      - `responsavel` (text, responsável pelo registro)
      - `assinatura` (text, assinatura digital)
      - `categoria` (enum, tipo de ocorrência)
      - `prioridade` (enum, nível de prioridade)
      - `status` (enum, status da ocorrência)
      - `criado_em` (timestamp)

  2. Enums
    - Categoria: elogio, problema_tecnico, cliente, funcionario, seguranca, outros
    - Prioridade: baixa, media, alta, critica
    - Status: aberto, em_andamento, resolvido, fechado

  3. Índices
    - Por data para consultas rápidas
    - Por setor para filtros
    - Por categoria e status
*/

-- Criar enum para categoria de ocorrência
DO $$ BEGIN
    CREATE TYPE categoria_ocorrencia AS ENUM (
        'elogio',
        'problema_tecnico', 
        'cliente',
        'funcionario',
        'seguranca',
        'outros'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum para prioridade
DO $$ BEGIN
    CREATE TYPE prioridade_ocorrencia AS ENUM (
        'baixa',
        'media',
        'alta',
        'critica'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum para status da ocorrência
DO $$ BEGIN
    CREATE TYPE status_ocorrencia AS ENUM (
        'aberto',
        'em_andamento',
        'resolvido',
        'fechado'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Atualizar tabela ocorrencias existente
DO $$
BEGIN
    -- Adicionar colunas se não existirem
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ocorrencias' AND column_name = 'categoria'
    ) THEN
        ALTER TABLE ocorrencias ADD COLUMN categoria categoria_ocorrencia DEFAULT 'outros';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ocorrencias' AND column_name = 'prioridade'
    ) THEN
        ALTER TABLE ocorrencias ADD COLUMN prioridade prioridade_ocorrencia DEFAULT 'media';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ocorrencias' AND column_name = 'status'
    ) THEN
        ALTER TABLE ocorrencias ADD COLUMN status status_ocorrencia DEFAULT 'aberto';
    END IF;
END $$;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias(data);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_setor ON ocorrencias(setor);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_categoria ON ocorrencias(categoria);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON ocorrencias(status);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_prioridade ON ocorrencias(prioridade);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_criado_em ON ocorrencias(criado_em);

-- View para relatórios de ocorrências
CREATE OR REPLACE VIEW vw_relatorio_ocorrencias AS
SELECT 
    o.*,
    CASE 
        WHEN o.data >= CURRENT_DATE THEN 'hoje'
        WHEN o.data >= CURRENT_DATE - INTERVAL '7 days' THEN 'semana'
        WHEN o.data >= CURRENT_DATE - INTERVAL '30 days' THEN 'mes'
        ELSE 'anterior'
    END as periodo_relativo,
    EXTRACT(YEAR FROM o.data) as ano,
    EXTRACT(MONTH FROM o.data) as mes,
    EXTRACT(DOW FROM o.data) as dia_semana
FROM ocorrencias o;

-- View para estatísticas de ocorrências
CREATE OR REPLACE VIEW vw_estatisticas_ocorrencias AS
SELECT 
    COUNT(*) as total_ocorrencias,
    COUNT(*) FILTER (WHERE categoria = 'elogio') as total_elogios,
    COUNT(*) FILTER (WHERE categoria = 'problema_tecnico') as total_problemas_tecnicos,
    COUNT(*) FILTER (WHERE categoria = 'cliente') as total_clientes,
    COUNT(*) FILTER (WHERE categoria = 'funcionario') as total_funcionarios,
    COUNT(*) FILTER (WHERE categoria = 'seguranca') as total_seguranca,
    COUNT(*) FILTER (WHERE categoria = 'outros') as total_outros,
    COUNT(*) FILTER (WHERE status = 'aberto') as total_abertas,
    COUNT(*) FILTER (WHERE status = 'em_andamento') as total_em_andamento,
    COUNT(*) FILTER (WHERE status = 'resolvido') as total_resolvidas,
    COUNT(*) FILTER (WHERE status = 'fechado') as total_fechadas,
    COUNT(*) FILTER (WHERE prioridade = 'critica') as total_criticas,
    COUNT(*) FILTER (WHERE prioridade = 'alta') as total_altas,
    COUNT(*) FILTER (WHERE data >= CURRENT_DATE) as total_hoje,
    COUNT(*) FILTER (WHERE data >= CURRENT_DATE - INTERVAL '7 days') as total_semana,
    COUNT(*) FILTER (WHERE data >= CURRENT_DATE - INTERVAL '30 days') as total_mes
FROM ocorrencias;

-- Comentários nas tabelas
COMMENT ON TABLE ocorrencias IS 'Livro de ocorrências para registro de eventos operacionais';
COMMENT ON COLUMN ocorrencias.categoria IS 'Categoria da ocorrência (elogio, problema_tecnico, cliente, funcionario, seguranca, outros)';
COMMENT ON COLUMN ocorrencias.prioridade IS 'Nível de prioridade da ocorrência (baixa, media, alta, critica)';
COMMENT ON COLUMN ocorrencias.status IS 'Status atual da ocorrência (aberto, em_andamento, resolvido, fechado)';

-- Inserir dados de exemplo
INSERT INTO ocorrencias (data, setor, descricao, categoria, prioridade, status, responsavel, acao_tomada) VALUES
(CURRENT_DATE, 'Bar', 'Cliente elogiou o atendimento da equipe do bar', 'elogio', 'baixa', 'fechado', 'Ana Silva', 'Elogio repassado para a equipe'),
(CURRENT_DATE - INTERVAL '1 day', 'Cozinha', 'Problema no freezer da cozinha - temperatura alta', 'problema_tecnico', 'alta', 'resolvido', 'Carlos Oliveira', 'Técnico chamado e problema resolvido'),
(CURRENT_DATE - INTERVAL '2 days', 'Eventos', 'Cliente reclamou do volume da música', 'cliente', 'media', 'resolvido', 'Ricardo Santos', 'Volume ajustado conforme solicitação'),
(CURRENT_DATE - INTERVAL '3 days', 'Segurança', 'Incidente com cliente alterado', 'seguranca', 'critica', 'fechado', 'João Segurança', 'Cliente removido do estabelecimento, polícia acionada')
ON CONFLICT DO NOTHING;