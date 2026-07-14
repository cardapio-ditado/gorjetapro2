/*
  # Adicionar suporte a consumo direto sem produção

  1. Mudanças em fichas_tecnicas
    - Adiciona tipo_consumo ('producao' ou 'venda_direta')
    - Define se ficha é usada em produção ou consumo direto na venda

  2. Mudanças em itens_estoque
    - Adiciona ficha_tecnica_id
    - Relaciona item com sua ficha de consumo

  3. Nova tabela movimentacoes_compostas
    - Agrupa múltiplas movimentações de uma operação
    - Rastreia baixa de insumos por venda

  4. Nova tabela movimentacoes_compostas_itens
    - Itens de cada movimentação composta
    - Diferencia produto principal de insumos

  5. Security
    - Enable RLS nas novas tabelas
    - Políticas de acesso total para authenticated
*/

-- 1. Adicionar tipo de consumo em fichas técnicas
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fichas_tecnicas' AND column_name = 'tipo_consumo'
  ) THEN
    ALTER TABLE fichas_tecnicas
    ADD COLUMN tipo_consumo TEXT DEFAULT 'producao'
    CHECK (tipo_consumo IN ('producao', 'venda_direta'));
  END IF;
END $$;

COMMENT ON COLUMN fichas_tecnicas.tipo_consumo IS
'Tipo de uso da ficha técnica:
- producao: Usada em ordens de produção (baixa insumos na produção)
- venda_direta: Baixa insumos direto na venda (drinks, porções)';

-- 2. Relacionar itens com fichas técnicas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itens_estoque' AND column_name = 'ficha_tecnica_id'
  ) THEN
    ALTER TABLE itens_estoque
    ADD COLUMN ficha_tecnica_id UUID REFERENCES fichas_tecnicas(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_itens_estoque_ficha
ON itens_estoque(ficha_tecnica_id);

COMMENT ON COLUMN itens_estoque.ficha_tecnica_id IS
'Ficha técnica do item. Ao vender:
- Se tipo_consumo=producao: Baixa só produto (insumos baixados na produção)
- Se tipo_consumo=venda_direta: Baixa insumos da ficha automaticamente
- Se NULL: Baixa só o próprio item';

-- 3. Criar movimentações compostas (agrupa múltiplas mov de uma operação)
CREATE TABLE IF NOT EXISTS movimentacoes_compostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('venda', 'producao', 'transferencia', 'ajuste')),
  referencia_id UUID,
  referencia_tipo TEXT,
  descricao TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT movimentacoes_compostas_ref_check
  CHECK (referencia_tipo IN ('venda_importada', 'producao', 'transferencia', 'manual', NULL))
);

CREATE INDEX IF NOT EXISTS idx_mov_compostas_referencia
ON movimentacoes_compostas(referencia_id);

CREATE INDEX IF NOT EXISTS idx_mov_compostas_criado
ON movimentacoes_compostas(criado_em DESC);

COMMENT ON TABLE movimentacoes_compostas IS
'Agrupa movimentações de estoque de uma mesma operação:
- Venda de drink: 1 composta com N movimentações de insumos
- Produção: 1 composta com N insumos + 1 produto final
- Permite rastrear origem e desfazer operações';

-- 4. Itens das movimentações compostas
CREATE TABLE IF NOT EXISTS movimentacoes_compostas_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composta_id UUID NOT NULL REFERENCES movimentacoes_compostas(id) ON DELETE CASCADE,
  movimentacao_id UUID NOT NULL REFERENCES movimentacoes_estoque(id) ON DELETE CASCADE,
  tipo_item TEXT NOT NULL CHECK (tipo_item IN ('produto_principal', 'insumo', 'subproduto', 'desperdicio')),
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_compostas_itens_composta
ON movimentacoes_compostas_itens(composta_id);

CREATE INDEX IF NOT EXISTS idx_mov_compostas_itens_movimentacao
ON movimentacoes_compostas_itens(movimentacao_id);

COMMENT ON TABLE movimentacoes_compostas_itens IS
'Itens que compõem uma movimentação composta:
- produto_principal: Item vendido/produzido
- insumo: Ingrediente consumido
- subproduto: Item gerado como extra
- desperdicio: Perda no processo';

-- 5. RLS
ALTER TABLE movimentacoes_compostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_compostas_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total movimentacoes_compostas"
  ON movimentacoes_compostas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acesso total movimentacoes_compostas_itens"
  ON movimentacoes_compostas_itens FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);