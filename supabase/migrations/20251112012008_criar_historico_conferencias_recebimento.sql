/*
  # Criar tabela de histórico de conferências de recebimento

  ## Descrição
  Cria tabela para armazenar histórico de conferências realizadas com IA
  durante o recebimento de mercadorias.

  ## Mudanças
  1. Nova tabela `conferencias_recebimento`
     - id (uuid, PK)
     - entrada_compra_id (uuid, FK)
     - arquivo_url (text) - URL da foto da nota
     - comparacoes (jsonb) - Resultado da comparação IA
     - resumo (jsonb) - Resumo estatístico
     - tokens_utilizados (int)
     - tempo_processamento (int) em ms
     - realizado_por (uuid, FK users)
     - realizado_em (timestamptz)

  ## Segurança
  - RLS habilitado
  - Policies para leitura autenticada
*/

-- Criar tabela de conferências
CREATE TABLE IF NOT EXISTS conferencias_recebimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_compra_id uuid REFERENCES entradas_compras(id) ON DELETE CASCADE,
  arquivo_url text,
  comparacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb,
  tokens_utilizados integer,
  tempo_processamento integer,
  realizado_por uuid REFERENCES auth.users(id),
  realizado_em timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE conferencias_recebimento ENABLE ROW LEVEL SECURITY;

-- Policy para leitura
CREATE POLICY "Usuários autenticados podem ler conferências"
  ON conferencias_recebimento
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy para inserção
CREATE POLICY "Usuários autenticados podem criar conferências"
  ON conferencias_recebimento
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = realizado_por);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_conferencias_entrada_compra 
  ON conferencias_recebimento(entrada_compra_id);

CREATE INDEX IF NOT EXISTS idx_conferencias_realizado_em 
  ON conferencias_recebimento(realizado_em DESC);
