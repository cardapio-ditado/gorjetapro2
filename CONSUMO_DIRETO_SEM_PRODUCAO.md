# 🎯 CONSUMO DIRETO SEM PRODUÇÃO - Documentação Técnica

## 📋 ÍNDICE
1. [Visão Geral](#visão-geral)
2. [Situação Atual](#situação-atual)
3. [Novo Fluxo Proposto](#novo-fluxo-proposto)
4. [Modelagem de Dados](#modelagem-de-dados)
5. [Implementação](#implementação)
6. [Exemplos Práticos](#exemplos-práticos)

---

## 🎯 VISÃO GERAL

### **PROBLEMA A RESOLVER:**

Atualmente, o sistema possui dois tipos de produtos:

1. **✅ Produtos com Produção Prévia** (JÁ FUNCIONA)
   - Ex: 1,2 kg picanha → 4x Picanha 400g
   - Fluxo: Compra → Produção → Estoque produto final → Venda
   - ✅ Baixa insumos na produção
   - ✅ Baixa produto final na venda

2. **❌ Produtos de Consumo Direto** (NÃO EXISTE)
   - Ex: Gin Tônica (75ml gin + 1 tônica)
   - Fluxo desejado: Venda → Baixa automática de insumos
   - ❌ Não passa por produção
   - ❌ Não tem baixa automática hoje

---

## 📊 SITUAÇÃO ATUAL

### **Sistema Existente:**

```
┌─────────────────────────────────────────────────────────────┐
│ PDV/VENDAS EXTERNAS                                         │
│ - "GIN TÔNICA DUPLA"                                        │
│ - "LONG NECK PACK 6"                                        │
│ - "PICANHA 400G"                                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ IA DE MAPEAMENTO (JÁ EXISTE)                                │
│ Tabela: mapeamento_itens_vendas                             │
│ - nome_externo: "GIN TÔNICA DUPLA"                          │
│ - item_estoque_id: [gin_tonica_id]                          │
│ - estoque_id: [bar_id]                                      │
│ - confianca: 0.95                                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ IMPORTAÇÃO VENDAS (JÁ EXISTE)                               │
│ Tabela: itens_importacao_vendas                             │
│ - nome_produto_externo                                      │
│ - item_estoque_id (mapeado pela IA)                         │
│ - estoque_id (mapeado pela IA)                              │
│ - status: 'mapeado' / 'pendente'                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ❌ PROBLEMA: BAIXA DE ESTOQUE                                │
│ - Hoje só baixa o produto final                             │
│ - NÃO baixa insumos automaticamente                         │
│ - Drinks ficam sem controle de consumo                      │
└─────────────────────────────────────────────────────────────┘
```

### **Tabelas Atuais:**

```sql
-- ✅ JÁ EXISTE
CREATE TABLE fichas_tecnicas (
  id UUID PRIMARY KEY,
  nome TEXT NOT NULL,
  porcoes INTEGER,
  custo_total NUMERIC,
  ativo BOOLEAN DEFAULT true
  -- ❌ FALTA: tipo_consumo (producao / venda_direta)
);

-- ✅ JÁ EXISTE
CREATE TABLE ficha_ingredientes (
  id UUID PRIMARY KEY,
  ficha_id UUID REFERENCES fichas_tecnicas(id),
  item_id UUID REFERENCES itens_estoque(id),
  quantidade NUMERIC NOT NULL,
  unidade TEXT
);

-- ✅ JÁ EXISTE - IA mapeia PDV → Estoque
CREATE TABLE mapeamento_itens_vendas (
  id UUID PRIMARY KEY,
  nome_externo TEXT NOT NULL,
  item_estoque_id UUID REFERENCES itens_estoque(id),
  estoque_id UUID,
  confianca NUMERIC,
  usado_vezes INTEGER DEFAULT 0
);

-- ✅ JÁ EXISTE - Vendas importadas
CREATE TABLE itens_importacao_vendas (
  id UUID PRIMARY KEY,
  importacao_id UUID,
  nome_produto_externo TEXT,
  quantidade NUMERIC,
  item_estoque_id UUID, -- Mapeado pela IA
  estoque_id UUID,       -- Mapeado pela IA
  status TEXT,           -- 'mapeado', 'pendente', 'processado'
  movimentacao_id UUID   -- ❌ Hoje só referencia 1 movimentação
);
```

---

## 🚀 NOVO FLUXO PROPOSTO

### **1. ADICIONAR TIPO DE CONSUMO NAS FICHAS TÉCNICAS**

```sql
ALTER TABLE fichas_tecnicas
ADD COLUMN tipo_consumo TEXT DEFAULT 'producao'
CHECK (tipo_consumo IN ('producao', 'venda_direta'));

COMMENT ON COLUMN fichas_tecnicas.tipo_consumo IS
'producao: Usa ordem de produção (picanha, pratos)
venda_direta: Baixa insumos direto na venda (drinks, porções)';
```

### **2. RELACIONAR ITENS DE ESTOQUE COM FICHAS TÉCNICAS**

```sql
ALTER TABLE itens_estoque
ADD COLUMN ficha_tecnica_id UUID REFERENCES fichas_tecnicas(id);

COMMENT ON COLUMN itens_estoque.ficha_tecnica_id IS
'Se preenchido, ao vender este item:
- tipo_consumo = producao: Baixa só o produto (insumos já foram baixados)
- tipo_consumo = venda_direta: Baixa os insumos da ficha automaticamente';
```

### **3. CRIAR TABELA DE MOVIMENTAÇÕES COMPOSTAS**

```sql
CREATE TABLE movimentacoes_compostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL, -- 'venda', 'producao', 'transferencia'
  referencia_id UUID, -- ID da venda/produção/etc
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE movimentacoes_compostas_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composta_id UUID REFERENCES movimentacoes_compostas(id) ON DELETE CASCADE,
  movimentacao_id UUID REFERENCES movimentacoes_estoque(id) ON DELETE CASCADE,
  tipo_item TEXT, -- 'produto_principal', 'insumo', 'desperdicio'
  criado_em TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE movimentacoes_compostas IS
'Agrupa múltiplas movimentações de uma mesma operação:
- Venda de drink = 1 composta com N insumos
- Produção = 1 composta com N insumos + 1 produto final';
```

### **4. FLUXO COMPLETO**

```
┌─────────────────────────────────────────────────────────────┐
│ VENDA IMPORTADA DO PDV                                      │
│ "GIN TÔNICA DUPLA" - 2 unidades                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ IA MAPEIA (mapeamento_itens_vendas)                         │
│ "GIN TÔNICA DUPLA" → item_estoque_id: [gin_tonica]          │
│                    → estoque_id: [bar]                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ITEM IMPORTADO (itens_importacao_vendas)                    │
│ - item_estoque_id: [gin_tonica]                             │
│ - quantidade: 2                                             │
│ - status: 'mapeado'                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ VERIFICAR FICHA TÉCNICA                                     │
│ itens_estoque.ficha_tecnica_id existe?                      │
└─────────────────────────────────────────────────────────────┘
       SIM ↓                              NÃO ↓
┌──────────────────────┐       ┌──────────────────────┐
│ FICHA ENCONTRADA     │       │ SEM FICHA            │
│ tipo_consumo?        │       │ Baixa só o produto   │
└──────────────────────┘       └──────────────────────┘
       ↓         ↓
'producao'  'venda_direta'
     ↓              ↓
┌─────────┐   ┌────────────────────────────────┐
│ Baixa   │   │ BAIXA INSUMOS AUTOMATICAMENTE  │
│ produto │   │ Para cada ingrediente:         │
│ final   │   │ - Gin: 75ml × 2 = 150ml        │
└─────────┘   │ - Tônica: 1 lata × 2 = 2 latas │
              │ - Limão: 1 un × 2 = 2 unidades  │
              └────────────────────────────────┘
                           ↓
              ┌────────────────────────────────┐
              │ MOVIMENTAÇÃO COMPOSTA          │
              │ Cria 1 registro agrupador +    │
              │ 3 movimentações de saída       │
              └────────────────────────────────┘
```

---

## 💾 MODELAGEM DE DADOS COMPLETA

### **MIGRATION 1: Adicionar Campos**

```sql
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
*/

-- 1. Adicionar tipo de consumo em fichas técnicas
ALTER TABLE fichas_tecnicas
ADD COLUMN IF NOT EXISTS tipo_consumo TEXT DEFAULT 'producao'
CHECK (tipo_consumo IN ('producao', 'venda_direta'));

COMMENT ON COLUMN fichas_tecnicas.tipo_consumo IS
'Tipo de uso da ficha técnica:
- producao: Usada em ordens de produção (baixa insumos na produção)
- venda_direta: Baixa insumos direto na venda (drinks, porções)';

-- 2. Relacionar itens com fichas técnicas
ALTER TABLE itens_estoque
ADD COLUMN IF NOT EXISTS ficha_tecnica_id UUID REFERENCES fichas_tecnicas(id);

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
```

### **MIGRATION 2: Função de Baixa Automática**

```sql
/*
  # Função para baixar insumos automaticamente na venda

  Cria função que:
  1. Recebe ID do item importado da venda
  2. Verifica se tem ficha técnica
  3. Se tipo_consumo = 'venda_direta', baixa todos os insumos
  4. Cria movimentação composta rastreável
  5. Atualiza saldos de estoque
*/

CREATE OR REPLACE FUNCTION baixar_insumos_venda_automatica(
  p_item_importacao_id UUID
) RETURNS TABLE (
  sucesso BOOLEAN,
  movimentacao_composta_id UUID,
  total_movimentacoes INTEGER,
  mensagem TEXT
) AS $$
DECLARE
  v_item RECORD;
  v_ficha RECORD;
  v_ingrediente RECORD;
  v_composta_id UUID;
  v_movimentacao_id UUID;
  v_count INTEGER := 0;
  v_quantidade_consumo NUMERIC;
BEGIN
  -- 1. Buscar item importado
  SELECT
    ii.id,
    ii.item_estoque_id,
    ii.estoque_id,
    ii.quantidade,
    ie.ficha_tecnica_id,
    ie.nome as item_nome
  INTO v_item
  FROM itens_importacao_vendas ii
  JOIN itens_estoque ie ON ie.id = ii.item_estoque_id
  WHERE ii.id = p_item_importacao_id
    AND ii.status = 'mapeado'
    AND ii.movimentacao_id IS NULL; -- Ainda não processado

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Item não encontrado ou já processado';
    RETURN;
  END IF;

  -- 2. Verificar se tem ficha técnica
  IF v_item.ficha_tecnica_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Item não possui ficha técnica';
    RETURN;
  END IF;

  -- 3. Buscar ficha técnica
  SELECT * INTO v_ficha
  FROM fichas_tecnicas
  WHERE id = v_item.ficha_tecnica_id
    AND ativo = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Ficha técnica não encontrada ou inativa';
    RETURN;
  END IF;

  -- 4. Verificar tipo de consumo
  IF v_ficha.tipo_consumo != 'venda_direta' THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      0,
      'Ficha tipo ' || v_ficha.tipo_consumo || ' - não processa na venda';
    RETURN;
  END IF;

  -- 5. Criar movimentação composta
  INSERT INTO movimentacoes_compostas (
    tipo,
    referencia_id,
    referencia_tipo,
    descricao
  ) VALUES (
    'venda',
    p_item_importacao_id,
    'venda_importada',
    'Consumo automático: ' || v_item.item_nome || ' (' || v_item.quantidade || 'x)'
  ) RETURNING id INTO v_composta_id;

  -- 6. Para cada ingrediente da ficha, criar movimentação de saída
  FOR v_ingrediente IN
    SELECT
      fi.item_id,
      fi.quantidade as qtd_por_porcao,
      fi.unidade,
      ie.nome as ingrediente_nome
    FROM ficha_ingredientes fi
    JOIN itens_estoque ie ON ie.id = fi.item_id
    WHERE fi.ficha_id = v_item.ficha_tecnica_id
  LOOP
    -- Calcular quantidade total consumida
    v_quantidade_consumo := v_ingrediente.qtd_por_porcao * v_item.quantidade;

    -- Criar movimentação de saída
    INSERT INTO movimentacoes_estoque (
      estoque_id,
      item_id,
      tipo,
      quantidade,
      documento,
      observacoes,
      criado_em
    ) VALUES (
      v_item.estoque_id,
      v_ingrediente.item_id,
      'saida',
      v_quantidade_consumo,
      'VENDA-' || p_item_importacao_id,
      'Consumo automático via ficha técnica: ' || v_ficha.nome ||
      ' (' || v_item.quantidade || ' porções)',
      now()
    ) RETURNING id INTO v_movimentacao_id;

    -- Adicionar à movimentação composta
    INSERT INTO movimentacoes_compostas_itens (
      composta_id,
      movimentacao_id,
      tipo_item
    ) VALUES (
      v_composta_id,
      v_movimentacao_id,
      'insumo'
    );

    v_count := v_count + 1;
  END LOOP;

  -- 7. Atualizar item importado
  UPDATE itens_importacao_vendas
  SET
    status = 'processado',
    processado_em = now(),
    movimentacao_id = v_composta_id -- Referencia a composta
  WHERE id = p_item_importacao_id;

  -- 8. Retornar resultado
  RETURN QUERY SELECT
    true,
    v_composta_id,
    v_count,
    'Sucesso: ' || v_count || ' insumos baixados do estoque';

EXCEPTION WHEN OTHERS THEN
  -- Rollback automático em caso de erro
  RETURN QUERY SELECT
    false,
    NULL::UUID,
    0,
    'Erro: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION baixar_insumos_venda_automatica IS
'Processa baixa automática de insumos para vendas com ficha técnica tipo venda_direta.
Uso: SELECT * FROM baixar_insumos_venda_automatica(item_importacao_id);';
```

### **MIGRATION 3: Função de Processamento em Lote**

```sql
/*
  # Processar todas as vendas pendentes de uma importação

  Processa todos os itens mapeados de uma importação que ainda
  não tiveram seus insumos baixados automaticamente.
*/

CREATE OR REPLACE FUNCTION processar_vendas_importacao(
  p_importacao_id UUID
) RETURNS TABLE (
  total_itens INTEGER,
  processados INTEGER,
  com_erro INTEGER,
  detalhes JSONB
) AS $$
DECLARE
  v_item_id UUID;
  v_resultado RECORD;
  v_total INTEGER := 0;
  v_sucesso INTEGER := 0;
  v_erros INTEGER := 0;
  v_detalhes JSONB := '[]'::JSONB;
BEGIN
  -- Processar cada item da importação
  FOR v_item_id IN
    SELECT id
    FROM itens_importacao_vendas
    WHERE importacao_id = p_importacao_id
      AND status = 'mapeado'
      AND movimentacao_id IS NULL
    ORDER BY linha_numero
  LOOP
    v_total := v_total + 1;

    -- Tentar baixar insumos
    SELECT * INTO v_resultado
    FROM baixar_insumos_venda_automatica(v_item_id)
    LIMIT 1;

    IF v_resultado.sucesso THEN
      v_sucesso := v_sucesso + 1;
    ELSE
      v_erros := v_erros + 1;
    END IF;

    -- Adicionar aos detalhes
    v_detalhes := v_detalhes || jsonb_build_object(
      'item_id', v_item_id,
      'sucesso', v_resultado.sucesso,
      'mensagem', v_resultado.mensagem,
      'movimentacoes', v_resultado.total_movimentacoes
    );
  END LOOP;

  -- Retornar resultado consolidado
  RETURN QUERY SELECT
    v_total,
    v_sucesso,
    v_erros,
    v_detalhes;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION processar_vendas_importacao IS
'Processa todas as vendas mapeadas de uma importação.
Uso: SELECT * FROM processar_vendas_importacao(importacao_id);';
```

---

## 🔧 IMPLEMENTAÇÃO NO FRONTEND

### **1. Cadastro de Ficha Técnica**

```typescript
// src/components/inventory/FichasTecnicas.tsx

interface FichaTecnica {
  id: string;
  nome: string;
  tipo_consumo: 'producao' | 'venda_direta'; // NOVO
  porcoes: number;
  ingredientes: Ingrediente[];
}

const FichaTecnicaForm = () => {
  const [tipoConsumo, setTipoConsumo] = useState<'producao' | 'venda_direta'>('producao');

  return (
    <form>
      {/* ... campos existentes ... */}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Tipo de Consumo
        </label>
        <select
          value={tipoConsumo}
          onChange={(e) => setTipoConsumo(e.target.value as any)}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="producao">
            Produção Prévia (requer ordem de produção)
          </option>
          <option value="venda_direta">
            Venda Direta (baixa insumos automaticamente)
          </option>
        </select>
        <p className="text-xs text-gray-500">
          {tipoConsumo === 'producao'
            ? '📦 Insumos serão baixados na ordem de produção'
            : '🔄 Insumos serão baixados automaticamente em cada venda'}
        </p>
      </div>

      {/* ... resto do formulário ... */}
    </form>
  );
};
```

### **2. Processar Vendas Importadas**

```typescript
// src/services/processarVendasService.ts

export const processarVendasImportadas = async (importacaoId: string) => {
  try {
    // Chamar função SQL que processa em lote
    const { data, error } = await supabase
      .rpc('processar_vendas_importacao', {
        p_importacao_id: importacaoId
      });

    if (error) throw error;

    return {
      success: true,
      total: data[0].total_itens,
      processados: data[0].processados,
      erros: data[0].com_erro,
      detalhes: data[0].detalhes
    };
  } catch (error) {
    console.error('Erro ao processar vendas:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Uso no componente
const handleProcessarVendas = async () => {
  setLoading(true);

  const resultado = await processarVendasImportadas(importacaoId);

  if (resultado.success) {
    alert(`
      ✅ Processamento concluído!

      Total de itens: ${resultado.total}
      Processados: ${resultado.processados}
      Com erro: ${resultado.erros}
    `);
  } else {
    alert(`❌ Erro: ${resultado.error}`);
  }

  setLoading(false);
};
```

### **3. Visualizar Movimentações Compostas**

```typescript
// src/components/inventory/MovimentacoesDetalhadas.tsx

const MovimentacaoCompostaCard = ({ composta }) => {
  const [itens, setItens] = useState([]);

  useEffect(() => {
    carregarItens();
  }, [composta.id]);

  const carregarItens = async () => {
    const { data } = await supabase
      .from('movimentacoes_compostas_itens')
      .select(`
        *,
        movimentacao:movimentacoes_estoque (
          quantidade,
          tipo,
          item:itens_estoque (nome, unidade_medida)
        )
      `)
      .eq('composta_id', composta.id);

    setItens(data);
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="font-medium text-gray-900">
            {composta.tipo.toUpperCase()}
          </h4>
          <p className="text-sm text-gray-600">{composta.descricao}</p>
        </div>
        <span className="text-xs text-gray-500">
          {new Date(composta.criado_em).toLocaleString()}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700">Itens consumidos:</p>
        {itens.map(item => (
          <div key={item.id} className="flex justify-between text-sm pl-4">
            <span className="text-gray-600">
              • {item.movimentacao.item.nome}
            </span>
            <span className="text-gray-900 font-medium">
              {item.movimentacao.quantidade} {item.movimentacao.item.unidade_medida}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## 📝 EXEMPLOS PRÁTICOS

### **Exemplo 1: Cadastrar Drink (Venda Direta)**

```sql
-- 1. Criar ficha técnica do Gin Tônica
INSERT INTO fichas_tecnicas (nome, tipo_consumo, porcoes, ativo)
VALUES ('Gin Tônica', 'venda_direta', 1, true)
RETURNING id; -- Exemplo: 'ficha-gin-123'

-- 2. Adicionar ingredientes
INSERT INTO ficha_ingredientes (ficha_id, item_id, quantidade, unidade)
VALUES
  ('ficha-gin-123', 'gin-litro-id', 0.075, 'L'), -- 75ml
  ('ficha-gin-123', 'tonica-lata-id', 1, 'unidade'),
  ('ficha-gin-123', 'limao-id', 0.5, 'unidade'),
  ('ficha-gin-123', 'gelo-id', 100, 'g');

-- 3. Criar item de estoque e ligar à ficha
INSERT INTO itens_estoque (nome, tipo_item, ficha_tecnica_id)
VALUES ('Gin Tônica', 'produto', 'ficha-gin-123')
RETURNING id; -- Exemplo: 'item-gin-tonica-id'
```

### **Exemplo 2: Processar Venda de Drink**

```sql
-- Simular importação de venda
INSERT INTO importacoes_vendas (arquivo_nome, total_linhas)
VALUES ('vendas-10-11-2025.csv', 50)
RETURNING id; -- Exemplo: 'importacao-123'

-- Item vendido (já mapeado pela IA)
INSERT INTO itens_importacao_vendas (
  importacao_id,
  linha_numero,
  nome_produto_externo,
  quantidade,
  item_estoque_id,
  estoque_id,
  status
) VALUES (
  'importacao-123',
  1,
  'GIN TÔNICA DUPLA',
  2,
  'item-gin-tonica-id',
  'bar-id',
  'mapeado'
) RETURNING id; -- Exemplo: 'item-venda-456'

-- Processar automaticamente
SELECT * FROM baixar_insumos_venda_automatica('item-venda-456');

-- Resultado:
-- ✅ sucesso: true
-- ✅ movimentacao_composta_id: 'composta-789'
-- ✅ total_movimentacoes: 4
-- ✅ mensagem: 'Sucesso: 4 insumos baixados do estoque'

-- Verificar movimentações criadas
SELECT
  me.tipo,
  ie.nome,
  me.quantidade,
  ie.unidade_medida,
  mci.tipo_item
FROM movimentacoes_compostas_itens mci
JOIN movimentacoes_estoque me ON me.id = mci.movimentacao_id
JOIN itens_estoque ie ON ie.id = me.item_id
WHERE mci.composta_id = 'composta-789';

-- Resultado:
-- tipo   | nome          | quantidade | unidade | tipo_item
-- -------|---------------|------------|---------|----------
-- saida  | Gin 1L        | 0.150      | L       | insumo
-- saida  | Água Tônica   | 2.000      | unidade | insumo
-- saida  | Limão         | 1.000      | unidade | insumo
-- saida  | Gelo          | 200.000    | g       | insumo
```

### **Exemplo 3: Cadastrar Picanha (Produção Prévia)**

```sql
-- 1. Criar ficha técnica de produção
INSERT INTO fichas_tecnicas (nome, tipo_consumo, porcoes, ativo)
VALUES ('Picanha 400g', 'producao', 4, true)
RETURNING id; -- 'ficha-picanha-123'

-- 2. Ingredientes
INSERT INTO ficha_ingredientes (ficha_id, item_id, quantidade, unidade)
VALUES
  ('ficha-picanha-123', 'picanha-kg-id', 1.2, 'kg'),
  ('ficha-picanha-123', 'sal-grosso-id', 0.05, 'kg'),
  ('ficha-picanha-123', 'alho-id', 0.1, 'kg');

-- 3. Produto final
INSERT INTO itens_estoque (nome, tipo_item, ficha_tecnica_id)
VALUES ('Picanha 400g', 'produto', 'ficha-picanha-123')
RETURNING id; -- 'picanha-400g-id'

-- 4. Ordem de produção (usa sistema existente)
-- Frontend: ProducaoEstoque.tsx
-- Fluxo: Seleciona ficha → Define quantidade → Baixa insumos → Dá entrada produto

-- 5. Na venda (já processada)
-- Item mapeado: "PICANHA 400G" → 'picanha-400g-id'
-- Sistema verifica: tipo_consumo = 'producao'
-- Ação: Baixa APENAS o produto final (insumos já foram na produção)
```

---

## 🎯 CHECKLIST DE IMPLEMENTAÇÃO

### **FASE 1: Banco de Dados**
- [ ] Adicionar campo `tipo_consumo` em `fichas_tecnicas`
- [ ] Adicionar campo `ficha_tecnica_id` em `itens_estoque`
- [ ] Criar tabela `movimentacoes_compostas`
- [ ] Criar tabela `movimentacoes_compostas_itens`
- [ ] Criar função `baixar_insumos_venda_automatica()`
- [ ] Criar função `processar_vendas_importacao()`
- [ ] Testar funções com dados de exemplo

### **FASE 2: Backend/Serviços**
- [ ] Criar serviço `processarVendasService.ts`
- [ ] Adicionar endpoint para processar vendas
- [ ] Adicionar endpoint para desfazer processamento
- [ ] Logs e auditoria

### **FASE 3: Frontend**
- [ ] Adicionar campo tipo de consumo em `FichasTecnicas.tsx`
- [ ] Adicionar campo ficha técnica em `ItensEstoque.tsx`
- [ ] Botão "Processar Vendas" em `ImportarVendasIA.tsx`
- [ ] Visualização de movimentações compostas
- [ ] Indicadores visuais (ícones para tipo de consumo)

### **FASE 4: Testes**
- [ ] Testar drink (venda direta)
- [ ] Testar prato (produção)
- [ ] Testar produto sem ficha
- [ ] Testar processamento em lote
- [ ] Verificar saldos de estoque
- [ ] Testar desfazer operação

### **FASE 5: Documentação**
- [ ] Manual do usuário
- [ ] Guia de cadastro de drinks
- [ ] Guia de cadastro de pratos
- [ ] FAQ

---

## 🚨 PONTOS DE ATENÇÃO

### **1. Unidades de Medida**
```sql
-- Garantir conversão correta:
-- 75ml → 0.075 L
-- 100g → 0.1 kg
-- Criar função de conversão se necessário
```

### **2. Estoque Negativo**
```sql
-- Decidir comportamento:
-- a) Bloquear venda se estoque insuficiente
-- b) Permitir negativo e alertar
-- c) Processar parcialmente
```

### **3. Desfazer Processamento**
```sql
-- Criar função para reverter:
CREATE FUNCTION reverter_movimentacao_composta(composta_id UUID)
-- Busca todas as movimentações
-- Cria movimentações inversas
-- Marca como revertido
```

### **4. Performance**
```sql
-- Índices críticos:
CREATE INDEX idx_itens_estoque_ficha ON itens_estoque(ficha_tecnica_id);
CREATE INDEX idx_mov_compostas_ref ON movimentacoes_compostas(referencia_id);
-- Processar vendas em background para grandes volumes
```

---

## 📊 RELATÓRIOS E CONSULTAS

### **CMV por Tipo de Consumo**

```sql
SELECT
  ft.tipo_consumo,
  COUNT(DISTINCT mc.id) as total_operacoes,
  SUM(me.quantidade * ie.custo_medio) as custo_total
FROM movimentacoes_compostas mc
JOIN movimentacoes_compostas_itens mci ON mci.composta_id = mc.id
JOIN movimentacoes_estoque me ON me.id = mci.movimentacao_id
JOIN itens_estoque ie ON ie.id = me.item_id
LEFT JOIN fichas_tecnicas ft ON ft.id = ie.ficha_tecnica_id
WHERE mc.criado_em >= '2025-11-01'
  AND mc.criado_em < '2025-12-01'
GROUP BY ft.tipo_consumo;
```

### **Itens Mais Vendidos sem Ficha Técnica**

```sql
SELECT
  ie.nome,
  COUNT(*) as total_vendas,
  SUM(iv.quantidade) as quantidade_total
FROM itens_importacao_vendas iv
JOIN itens_estoque ie ON ie.id = iv.item_estoque_id
WHERE iv.status = 'mapeado'
  AND ie.ficha_tecnica_id IS NULL
  AND iv.criado_em >= NOW() - INTERVAL '30 days'
GROUP BY ie.id, ie.nome
ORDER BY total_vendas DESC
LIMIT 20;
```

---

## 🎓 CONCLUSÃO

Este sistema permite:

✅ **Produção Prévia** (continua funcionando)
- Ordem de produção baixa insumos
- Venda baixa produto final
- CMV rastreável

✅ **Consumo Direto** (novo recurso)
- Venda baixa insumos automaticamente
- Sem ordem de produção
- Ficha técnica define receita

✅ **Mapeamento Inteligente** (usa IA existente)
- PDV → Itens de gestão
- Automático com confiança
- Manual quando necessário

✅ **Rastreabilidade Total**
- Movimentações compostas
- Origem de cada baixa
- Reversível

✅ **Flexibilidade**
- Item sem ficha: baixa só o produto
- Item com ficha produção: baixa produto (insumos já baixados)
- Item com ficha venda: baixa insumos automaticamente

---

**Pronto para implementação! 🚀**
