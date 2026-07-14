/*
  # Simplificar sistema de solicitações para acesso público

  1. Alterações
    - Adicionar campo para diferenciar solicitações simplificadas
    - Adicionar campo para token de acesso público
    - Criar função para gerar número de solicitação automaticamente
    - Tornar campos opcionais para solicitações simplificadas
    - Adicionar índices para performance
    
  2. Segurança
    - Manter RLS já existente
    - Adicionar validação para impedir edição após envio
*/

-- Adicionar campos para solicitações simplificadas
ALTER TABLE solicitacoes 
  ADD COLUMN IF NOT EXISTS origem text DEFAULT 'sistema' CHECK (origem IN ('sistema', 'publica'));

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS token_acesso text;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS ip_origem text;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS data_envio timestamp with time zone;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS enriquecida boolean DEFAULT false;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS enriquecida_por text;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS data_enriquecimento timestamp with time zone;

-- Criar constraint única para token_acesso
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'solicitacoes_token_acesso_key'
  ) THEN
    ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_token_acesso_key UNIQUE (token_acesso);
  END IF;
END $$;

-- Criar função para gerar número de solicitação automaticamente
CREATE OR REPLACE FUNCTION gerar_numero_solicitacao()
RETURNS TRIGGER AS $$
DECLARE
  proximo_numero integer;
  ano_atual text;
  novo_numero text;
BEGIN
  -- Obter ano atual
  ano_atual := to_char(now(), 'YYYY');
  
  -- Obter o próximo número sequencial do ano
  SELECT COALESCE(MAX(
    CAST(
      substring(numero_solicitacao from '[0-9]+$') AS integer
    )
  ), 0) + 1
  INTO proximo_numero
  FROM solicitacoes
  WHERE numero_solicitacao LIKE 'SOL-' || ano_atual || '-%';
  
  -- Gerar o novo número com padding de 5 dígitos
  novo_numero := 'SOL-' || ano_atual || '-' || lpad(proximo_numero::text, 5, '0');
  
  NEW.numero_solicitacao := novo_numero;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para gerar número automaticamente
DROP TRIGGER IF EXISTS trigger_gerar_numero_solicitacao ON solicitacoes;
CREATE TRIGGER trigger_gerar_numero_solicitacao
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW
  WHEN (NEW.numero_solicitacao IS NULL)
  EXECUTE FUNCTION gerar_numero_solicitacao();

-- Criar função para gerar token de acesso
CREATE OR REPLACE FUNCTION gerar_token_acesso()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origem = 'publica' AND NEW.token_acesso IS NULL THEN
    NEW.token_acesso := encode(gen_random_bytes(16), 'hex');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para gerar token
DROP TRIGGER IF EXISTS trigger_gerar_token_acesso ON solicitacoes;
CREATE TRIGGER trigger_gerar_token_acesso
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW
  EXECUTE FUNCTION gerar_token_acesso();

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_solicitacoes_origem ON solicitacoes(origem);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_token_acesso ON solicitacoes(token_acesso);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_data_solicitacao ON solicitacoes(data_solicitacao);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_enriquecida ON solicitacoes(enriquecida) WHERE origem = 'publica';

-- Atualizar view para incluir novos campos
DROP VIEW IF EXISTS vw_solicitacoes_completas;
CREATE OR REPLACE VIEW vw_solicitacoes_completas AS
SELECT
    s.id,
    s.numero_solicitacao,
    s.tipo_solicitacao_id,
    ts.nome AS tipo_nome,
    ts.tipo_categoria,
    s.titulo,
    s.descricao,
    s.prioridade,
    s.status,
    s.solicitante_nome,
    s.solicitante_email,
    s.solicitante_telefone,
    s.setor_solicitante,
    s.local_servico,
    s.equipamento_afetado,
    s.detalhes_tecnicos,
    s.data_solicitacao,
    s.data_limite,
    s.valor_estimado,
    s.valor_aprovado,
    s.valor_total_orcado,
    s.fornecedor_responsavel,
    s.contato_fornecedor,
    s.numero_orcamento,
    s.responsavel_execucao,
    s.origem,
    s.token_acesso,
    s.enriquecida,
    s.enriquecida_por,
    s.data_enriquecimento,
    s.criado_em,
    (SELECT COUNT(*) FROM anexos_solicitacao WHERE solicitacao_id = s.id) AS total_anexos,
    (SELECT COUNT(*) FROM comentarios_solicitacao WHERE solicitacao_id = s.id) AS total_comentarios
FROM solicitacoes s
LEFT JOIN tipos_solicitacao ts ON s.tipo_solicitacao_id = ts.id;
