/*
  # Permitir Requisições Internas Públicas

  ## Alterações
  1. Adicionar campo `criado_anonimamente` para identificar requisições públicas
  2. Permitir usuários anônimos criar requisições internas
  3. Permitir usuários anônimos ler itens e estoques necessários
  4. Adicionar campo `whatsapp` para contato do solicitante

  ## Segurança
  - Anônimos podem apenas CRIAR requisições (não editar/excluir)
  - Anônimos podem LER estoques e itens (necessário para o formulário)
  - Usuários autenticados mantêm todas as permissões
*/

-- Adicionar campo whatsapp e flag de criação anônima
ALTER TABLE requisicoes_internas 
ADD COLUMN IF NOT EXISTS whatsapp text,
ADD COLUMN IF NOT EXISTS criado_anonimamente boolean DEFAULT false;

-- Permitir anônimos criar requisições
DROP POLICY IF EXISTS "Permitir anon criar requisicoes" ON requisicoes_internas;
CREATE POLICY "Permitir anon criar requisicoes"
  ON requisicoes_internas FOR INSERT
  TO anon
  WITH CHECK (true);

-- Permitir anônimos criar itens de requisição
DROP POLICY IF EXISTS "Permitir anon criar itens requisicao" ON requisicoes_internas_itens;
CREATE POLICY "Permitir anon criar itens requisicao"
  ON requisicoes_internas_itens FOR INSERT
  TO anon
  WITH CHECK (true);

-- Permitir anônimos ler estoques ativos
DROP POLICY IF EXISTS "Permitir anon ler estoques" ON estoques;
CREATE POLICY "Permitir anon ler estoques"
  ON estoques FOR SELECT
  TO anon
  USING (status = true);

-- Permitir anônimos ler itens ativos
DROP POLICY IF EXISTS "Permitir anon ler itens" ON itens_estoque;
CREATE POLICY "Permitir anon ler itens"
  ON itens_estoque FOR SELECT
  TO anon
  USING (status = 'ativo');

-- Permitir anônimos ler saldos de estoque
DROP POLICY IF EXISTS "Permitir anon ler saldos" ON saldos_estoque;
CREATE POLICY "Permitir anon ler saldos"
  ON saldos_estoque FOR SELECT
  TO anon
  USING (quantidade_atual > 0);

-- Comentários
COMMENT ON COLUMN requisicoes_internas.whatsapp IS 'WhatsApp para contato do solicitante (requisições públicas)';
COMMENT ON COLUMN requisicoes_internas.criado_anonimamente IS 'Indica se a requisição foi criada via formulário público';