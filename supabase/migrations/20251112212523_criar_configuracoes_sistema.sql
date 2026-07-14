/*
  # Configurações do Sistema
  
  1. Nova Tabela
    - `configuracoes_sistema` - Armazena configurações globais do sistema
      - `id` (uuid, primary key)
      - `chave` (text, unique) - Nome da configuração
      - `valor` (text) - Valor da configuração (criptografado para senhas)
      - `descricao` (text) - Descrição da configuração
      - `tipo` (text) - Tipo: 'texto', 'senha', 'numero', 'boolean'
      - `categoria` (text) - Categoria: 'ia', 'sistema', 'notificacoes', etc
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)

  2. Segurança
    - RLS habilitado
    - Apenas usuários autenticados podem ler
    - Apenas master pode modificar
*/

-- Criar tabela de configurações
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text UNIQUE NOT NULL,
  valor text,
  descricao text,
  tipo text DEFAULT 'texto' CHECK (tipo IN ('texto', 'senha', 'numero', 'boolean')),
  categoria text DEFAULT 'sistema',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários autenticados podem ler configurações"
  ON configuracoes_sistema
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Apenas service role pode inserir configurações"
  ON configuracoes_sistema
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Apenas service role pode atualizar configurações"
  ON configuracoes_sistema
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Inserir configuração padrão para OpenAI
INSERT INTO configuracoes_sistema (chave, valor, descricao, tipo, categoria)
VALUES 
  ('openai_api_key', NULL, 'Chave de API da OpenAI para o Super Agente IA', 'senha', 'ia'),
  ('openai_model', 'gpt-4o-mini', 'Modelo da OpenAI a ser usado (gpt-4o-mini, gpt-4o, gpt-3.5-turbo)', 'texto', 'ia'),
  ('ia_habilitada', 'true', 'Habilitar funcionalidades de IA', 'boolean', 'ia')
ON CONFLICT (chave) DO NOTHING;

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_configuracoes_categoria ON configuracoes_sistema(categoria);
CREATE INDEX IF NOT EXISTS idx_configuracoes_chave ON configuracoes_sistema(chave);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp_configuracoes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_configuracoes
  BEFORE UPDATE ON configuracoes_sistema
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_configuracoes();
