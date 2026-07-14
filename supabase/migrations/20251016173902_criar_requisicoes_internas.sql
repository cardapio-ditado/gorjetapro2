/*
  # Criar Tabela de Requisições Internas

  ## Descrição
  Sistema de requisição interna para transferência de itens entre estoques.
  Funcionários podem solicitar itens do estoque central para seus setores.

  ## Tabelas Criadas

  ### requisicoes_internas
  - `id` (uuid, PK) - Identificador único
  - `numero_requisicao` (text) - Número sequencial da requisição
  - `data_requisicao` (timestamptz) - Data/hora da requisição
  - `funcionario_nome` (text) - Nome do funcionário solicitante
  - `setor` (text) - Setor do funcionário
  - `estoque_origem_id` (uuid, FK) - Estoque de origem (central)
  - `estoque_destino_id` (uuid, FK) - Estoque de destino (setor)
  - `status` (text) - Status: pendente, aprovado, rejeitado, concluido
  - `observacoes` (text) - Observações gerais
  - `aprovado_por` (uuid, FK) - Usuário que aprovou
  - `data_aprovacao` (timestamptz) - Data/hora da aprovação
  - `concluido_por` (uuid, FK) - Usuário que concluiu
  - `data_conclusao` (timestamptz) - Data/hora da conclusão
  - `created_at` (timestamptz) - Data de criação
  - `updated_at` (timestamptz) - Data de atualização

  ### requisicoes_internas_itens
  - `id` (uuid, PK) - Identificador único
  - `requisicao_id` (uuid, FK) - Requisição relacionada
  - `item_id` (uuid, FK) - Item do estoque
  - `quantidade_solicitada` (numeric) - Quantidade solicitada
  - `quantidade_aprovada` (numeric) - Quantidade aprovada
  - `quantidade_entregue` (numeric) - Quantidade entregue
  - `observacao` (text) - Observação do item
  - `created_at` (timestamptz) - Data de criação

  ## Segurança
  - RLS habilitado em todas as tabelas
  - Políticas permissivas para usuários autenticados
*/

-- Criar tabela de requisições internas
CREATE TABLE IF NOT EXISTS requisicoes_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_requisicao text UNIQUE NOT NULL,
  data_requisicao timestamptz DEFAULT now() NOT NULL,
  funcionario_nome text NOT NULL,
  setor text NOT NULL,
  estoque_origem_id uuid REFERENCES estoques(id) ON DELETE RESTRICT,
  estoque_destino_id uuid REFERENCES estoques(id) ON DELETE RESTRICT,
  status text DEFAULT 'pendente' NOT NULL CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'concluido')),
  observacoes text,
  aprovado_por uuid REFERENCES usuarios_sistema(id),
  data_aprovacao timestamptz,
  concluido_por uuid REFERENCES usuarios_sistema(id),
  data_conclusao timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Criar tabela de itens das requisições
CREATE TABLE IF NOT EXISTS requisicoes_internas_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id uuid REFERENCES requisicoes_internas(id) ON DELETE CASCADE NOT NULL,
  item_id uuid REFERENCES itens_estoque(id) ON DELETE RESTRICT NOT NULL,
  quantidade_solicitada numeric(10,2) DEFAULT 0 NOT NULL CHECK (quantidade_solicitada >= 0),
  quantidade_aprovada numeric(10,2) DEFAULT 0 CHECK (quantidade_aprovada >= 0),
  quantidade_entregue numeric(10,2) DEFAULT 0 CHECK (quantidade_entregue >= 0),
  observacao text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_requisicoes_internas_status ON requisicoes_internas(status);
CREATE INDEX IF NOT EXISTS idx_requisicoes_internas_data ON requisicoes_internas(data_requisicao DESC);
CREATE INDEX IF NOT EXISTS idx_requisicoes_internas_funcionario ON requisicoes_internas(funcionario_nome);
CREATE INDEX IF NOT EXISTS idx_requisicoes_internas_itens_requisicao ON requisicoes_internas_itens(requisicao_id);

-- Função para gerar número de requisição
CREATE OR REPLACE FUNCTION gerar_numero_requisicao()
RETURNS text AS $$
DECLARE
  proximo_numero integer;
  ano_atual text;
BEGIN
  ano_atual := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(numero_requisicao FROM '\d+$') AS integer)), 0) + 1
  INTO proximo_numero
  FROM requisicoes_internas
  WHERE numero_requisicao LIKE 'REQ-' || ano_atual || '-%';
  
  RETURN 'REQ-' || ano_atual || '-' || LPAD(proximo_numero::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger para gerar número automaticamente
CREATE OR REPLACE FUNCTION trigger_gerar_numero_requisicao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_requisicao IS NULL OR NEW.numero_requisicao = '' THEN
    NEW.numero_requisicao := gerar_numero_requisicao();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requisicao_gerar_numero
  BEFORE INSERT ON requisicoes_internas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_gerar_numero_requisicao();

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION trigger_requisicao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requisicao_updated_at
  BEFORE UPDATE ON requisicoes_internas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_requisicao_updated_at();

-- Habilitar RLS
ALTER TABLE requisicoes_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicoes_internas_itens ENABLE ROW LEVEL SECURITY;

-- Políticas RLS permissivas
CREATE POLICY "Acesso total requisicoes"
  ON requisicoes_internas FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acesso total requisicoes itens"
  ON requisicoes_internas_itens FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Comentários
COMMENT ON TABLE requisicoes_internas IS 'Requisições internas de transferência entre estoques';
COMMENT ON TABLE requisicoes_internas_itens IS 'Itens das requisições internas';
COMMENT ON COLUMN requisicoes_internas.status IS 'Status: pendente, aprovado, rejeitado, concluido';
