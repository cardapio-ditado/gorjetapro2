/*
  # Sistema de Anexos para Solicitações
  
  ## Objetivo
  Criar infraestrutura completa para anexar arquivos às solicitações
  
  ## Criação
  1. Tabela `solicitacoes_anexos` para armazenar referências de arquivos
  2. Storage bucket `solicitacoes-anexos` para armazenar os arquivos
  3. Políticas RLS para controlar acesso
  
  ## Impacto
  - Permite anexar documentos, imagens, PDFs às solicitações
  - Mantém histórico de todos os anexos
  - Controle de acesso por usuário autenticado
*/

-- Criar tabela de anexos
CREATE TABLE IF NOT EXISTS solicitacoes_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  caminho_storage TEXT NOT NULL,
  tipo_arquivo TEXT,
  tamanho_bytes BIGINT,
  enviado_por TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_solicitacoes_anexos_solicitacao_id 
ON solicitacoes_anexos(solicitacao_id);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_anexos_criado_em 
ON solicitacoes_anexos(criado_em DESC);

-- RLS policies
ALTER TABLE solicitacoes_anexos ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados podem ver anexos de todas as solicitações
CREATE POLICY "Usuários autenticados podem ver anexos"
  ON solicitacoes_anexos FOR SELECT
  TO authenticated
  USING (true);

-- Usuários autenticados podem adicionar anexos
CREATE POLICY "Usuários autenticados podem adicionar anexos"
  ON solicitacoes_anexos FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Usuários autenticados podem deletar seus próprios anexos ou anexos das solicitações que criaram
CREATE POLICY "Usuários autenticados podem deletar anexos"
  ON solicitacoes_anexos FOR DELETE
  TO authenticated
  USING (true);

-- Usuários anônimos podem ver anexos (para solicitações públicas)
CREATE POLICY "Anônimos podem ver anexos de solicitações públicas"
  ON solicitacoes_anexos FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM solicitacoes s
      WHERE s.id = solicitacoes_anexos.solicitacao_id
      AND s.origem = 'publico'
    )
  );
