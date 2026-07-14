/*
  # Permitir Requisições Públicas de Estoque

  1. Alterações na Tabela
    - Adicionar campo `whatsapp` para contato
    - Adicionar flag `criado_anonimamente` para identificar requisições públicas

  2. Segurança
    - Permitir acesso anônimo (anon) para criar requisições
    - Permitir acesso anônimo para leitura de estoques e itens (necessário para o formulário)
    - Manter proteção para outras operações
*/

-- Adicionar campos para requisições públicas
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'requisicoes_internas' AND column_name = 'whatsapp'
  ) THEN
    ALTER TABLE requisicoes_internas 
    ADD COLUMN whatsapp text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'requisicoes_internas' AND column_name = 'criado_anonimamente'
  ) THEN
    ALTER TABLE requisicoes_internas 
    ADD COLUMN criado_anonimamente boolean DEFAULT false;
  END IF;
END $$;

-- Permitir usuários anônimos criarem requisições
DROP POLICY IF EXISTS "Usuários anônimos podem criar requisições" ON requisicoes_internas;
CREATE POLICY "Usuários anônimos podem criar requisições"
  ON requisicoes_internas
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Permitir usuários anônimos criarem itens de requisições
DROP POLICY IF EXISTS "Usuários anônimos podem criar itens de requisições" ON requisicoes_internas_itens;
CREATE POLICY "Usuários anônimos podem criar itens de requisições"
  ON requisicoes_internas_itens
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Permitir usuários anônimos lerem estoques (necessário para o formulário)
DROP POLICY IF EXISTS "Usuários anônimos podem ler estoques" ON estoques;
CREATE POLICY "Usuários anônimos podem ler estoques"
  ON estoques
  FOR SELECT
  TO anon
  USING (status = true);

-- Permitir usuários anônimos lerem itens de estoque (necessário para o formulário)
DROP POLICY IF EXISTS "Usuários anônimos podem ler itens de estoque" ON itens_estoque;
CREATE POLICY "Usuários anônimos podem ler itens de estoque"
  ON itens_estoque
  FOR SELECT
  TO anon
  USING (status = 'ativo');

-- Permitir usuários anônimos lerem saldos de estoque (necessário para o formulário)
DROP POLICY IF EXISTS "Usuários anônimos podem ler saldos de estoque" ON saldos_estoque;
CREATE POLICY "Usuários anônimos podem ler saldos de estoque"
  ON saldos_estoque
  FOR SELECT
  TO anon
  USING (true);

-- Criar índice para otimizar buscas por requisições públicas
CREATE INDEX IF NOT EXISTS idx_requisicoes_internas_criado_anonimamente 
ON requisicoes_internas(criado_anonimamente) 
WHERE criado_anonimamente = true;
