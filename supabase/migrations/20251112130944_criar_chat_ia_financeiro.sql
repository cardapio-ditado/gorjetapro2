/*
  # Chat com IA para Financeiro
  
  1. Nova Tabela
    - `chat_ia_financeiro` - Histórico de conversas com IA
      - `id` (uuid, primary key)
      - `usuario_id` (uuid, referência para auth.users)
      - `mensagem` (text) - Mensagem do usuário
      - `resposta_ia` (text) - Resposta da IA
      - `acao_executada` (jsonb) - Ação realizada (lançamento, consulta, etc)
      - `contexto` (jsonb) - Contexto da conversa (últimas mensagens)
      - `modelo_ia` (text) - Modelo usado (claude, gpt, etc)
      - `tokens_usados` (int) - Tokens gastos
      - `criado_em` (timestamptz)
  
  2. Segurança
    - RLS habilitado
    - Usuários veem apenas suas conversas
    - Auditoria completa de comandos executados
  
  3. Índices
    - Por usuário e data para busca rápida
*/

-- Criar tabela de histórico de conversas
CREATE TABLE IF NOT EXISTS chat_ia_financeiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mensagem text NOT NULL,
  resposta_ia text,
  acao_executada jsonb DEFAULT '{}'::jsonb,
  contexto jsonb DEFAULT '[]'::jsonb,
  modelo_ia text DEFAULT 'claude-3-5-sonnet',
  tokens_usados int DEFAULT 0,
  criado_em timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE chat_ia_financeiro ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários veem próprias conversas"
  ON chat_ia_financeiro FOR SELECT
  TO authenticated
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários criam próprias conversas"
  ON chat_ia_financeiro FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários atualizam próprias conversas"
  ON chat_ia_financeiro FOR UPDATE
  TO authenticated
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários excluem próprias conversas"
  ON chat_ia_financeiro FOR DELETE
  TO authenticated
  USING (auth.uid() = usuario_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_chat_ia_usuario_data 
  ON chat_ia_financeiro(usuario_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_chat_ia_acao 
  ON chat_ia_financeiro USING gin(acao_executada);

-- Comentários
COMMENT ON TABLE chat_ia_financeiro IS 
'Histórico de conversas com IA para o módulo financeiro. Registra comandos, respostas e ações executadas.';

COMMENT ON COLUMN chat_ia_financeiro.acao_executada IS 
'JSON com detalhes da ação executada: {tipo: "lancar_conta", dados: {...}, sucesso: true}';

COMMENT ON COLUMN chat_ia_financeiro.contexto IS 
'Array com últimas 5 mensagens da conversa para manter contexto';
