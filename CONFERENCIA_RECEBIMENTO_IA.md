# Sistema de Conferência de Recebimento com IA

## Visão Geral

O sistema de conferência inteligente permite comparar automaticamente a nota fiscal recebida com o pedido de compra original, identificando divergências em quantidades, valores e itens.

## Como Funciona

### 1. Fluxo de Conferência

```
Pedido de Compra (Pendente)
    ↓
📸 Foto da Nota Recebida
    ↓
🤖 IA Extrai Dados da Foto
    ↓
⚖️ Comparação Automática
    ↓
✅ Conferência Visual
    ↓
📝 Recebimento com Divergências
```

### 2. Processo Passo a Passo

#### Passo 1: Iniciar Conferência
- Na lista de compras pendentes, clique no ícone 📷 (Conferir com IA)
- Sistema carrega os dados do pedido original

#### Passo 2: Capturar Foto
- Tire uma foto da nota fiscal recebida
- Ou faça upload de uma imagem existente
- Formatos aceitos: JPG, PNG (máx 20MB)

#### Passo 3: Análise com IA
- IA extrai automaticamente:
  - Descrição de cada item
  - Código do produto
  - Quantidade recebida
  - Unidade de medida
  - Valor unitário
  - Valor total

#### Passo 4: Comparação Inteligente
O sistema compara cada item do pedido com a nota recebida:

**Algoritmo de Matching**:
- ✅ Código exato: +10 pontos
- ✅ Nome exato (normalizado): +8 pontos
- ✅ Nome contém termo: +5 pontos
- ✅ Palavras-chave: +1 ponto cada

**Normalização**:
- Remove acentos
- Remove espaços
- Converte para minúsculas

#### Passo 5: Classificação de Status

Cada item recebe um status:

| Status | Cor | Descrição |
|--------|-----|-----------|
| ✅ **Conforme** | Verde | Quantidade e valor corretos |
| ⚠️ **Divergência** | Amarelo | Diferença em quantidade ou valor |
| ❌ **Faltando** | Vermelho | Item não veio na nota |
| ➕ **Extra** | Azul | Item que não estava no pedido |

### 3. Resumo Visual

Após a análise, você vê um resumo completo:

```
┌─────────────┬──────────────┬────────────┬──────────┬─────────┐
│   Conforme  │ Divergências │  Faltando  │  Extras  │  Total  │
│     🟢 5    │     🟡 2     │    🔴 1    │   🔵 0   │   📦 8  │
└─────────────┴──────────────┴────────────┴──────────┴─────────┘
```

### 4. Detalhamento das Divergências

Para cada item com divergência, o sistema mostra:

**Pedido vs Recebido**:
```
Item: Óleo de Soja 900ml
┌──────────────────────────────────────┐
│ PEDIDO                    RECEBIDO   │
│ Qtd: 10 un                Qtd: 8 un  │
│ R$ 5,50                   R$ 5,80    │
│                                       │
│ 📊 Divergências:                     │
│ • Quantidade: 10 → 8 (-2 un)         │
│ • Valor: R$ 5,50 → R$ 5,80 (+R$0,30) │
└──────────────────────────────────────┘
```

### 5. Confirmação

Após revisar todas as divergências:
- Clique em "Confirmar Recebimento"
- Sistema preenche automaticamente o modal de recebimento
- Quantidades ajustadas conforme recebido
- Divergências já documentadas
- Confirme para dar entrada no estoque

## Benefícios

### 🎯 Precisão
- Reduz erros humanos na conferência
- Compara item por item automaticamente
- Identifica diferenças sutis

### ⚡ Agilidade
- Conferência em segundos
- Apenas tire foto da nota
- IA faz todo o trabalho pesado

### 📊 Rastreabilidade
- Histórico completo de conferências
- Registro de divergências
- Motivos documentados

### 💰 Controle Financeiro
- Detecta cobranças incorretas
- Identifica itens faltantes
- Previne prejuízos

### 📝 Documentação
- Foto da nota armazenada
- Comparação salva no histórico
- Auditoria completa

## Casos de Uso

### Caso 1: Tudo Conforme ✅
```
Pedido: 5 itens, R$ 250,00
Recebido: 5 itens, R$ 250,00
Status: 5 conformes
Ação: Confirmação rápida
```

### Caso 2: Divergência de Quantidade ⚠️
```
Pedido: Arroz 10 kg - Qtd: 20 un
Recebido: Arroz 10 kg - Qtd: 18 un
Status: Divergência (-2 un)
Ação: Ajustar recebimento, contactar fornecedor
```

### Caso 3: Diferença de Preço ⚠️
```
Pedido: Feijão - R$ 8,50/kg
Recebido: Feijão - R$ 9,20/kg
Status: Divergência (+R$ 0,70)
Ação: Verificar com fornecedor, ajustar custo
```

### Caso 4: Item Faltando ❌
```
Pedido: Açúcar 5kg - Qtd: 10 un
Recebido: Item não encontrado
Status: Faltando
Ação: Recebimento zerado, cobrança do fornecedor
```

### Caso 5: Item Extra ➕
```
Pedido: Não consta
Recebido: Sal 1kg - Qtd: 5 un
Status: Extra
Ação: Verificar se é brinde ou erro na nota
```

## Tecnologia

### Edge Function: `conferir-recebimento`
- Localização: `/supabase/functions/conferir-recebimento`
- Modelo IA: GPT-4o (visão + texto)
- Processo: ~2-5 segundos
- Custo: ~500-1000 tokens por nota

### Componente: `ConferenciaRecebimentoModal`
- Upload de foto (camera ou arquivo)
- Preview da imagem
- Comparação visual lado a lado
- Resumo estatístico
- Integração com recebimento

### Banco de Dados
- Tabela: `conferencias_recebimento`
- Campos: comparações, resumo, foto, timestamps
- Histórico completo auditável
- Relatórios de divergências

## Segurança

✅ RLS habilitado em todas as tabelas
✅ Apenas usuários autenticados
✅ Registro de quem realizou a conferência
✅ Histórico imutável
✅ Fotos armazenadas com segurança

## Dicas de Uso

1. **Foto Clara**: Tire foto com boa iluminação
2. **Enquadramento**: Capture a nota inteira
3. **Foco**: Garanta que os itens estejam legíveis
4. **Revise**: Sempre confira as sugestões da IA
5. **Documente**: Adicione observações em divergências

## Limitações

- Notas muito antigas/desgastadas podem ter extração parcial
- Códigos de barras não são lidos (apenas texto)
- Fotos tremidas ou desfocadas reduzem precisão
- Máximo 20MB por arquivo

## Comparação: Conferência Manual vs IA

| Aspecto | Manual | Com IA |
|---------|--------|--------|
| Tempo | 10-15 min | 30-60 seg |
| Erros | 5-10% | <1% |
| Documentação | Papel/anotações | Digital automático |
| Rastreabilidade | Baixa | Alta |
| Auditoria | Difícil | Fácil |
| Escalabilidade | Limitada | Alta |

## Roadmap Futuro

- [ ] Leitura de código de barras
- [ ] Suporte a múltiplas páginas
- [ ] Comparação de lote/validade
- [ ] Alertas automáticos de divergências
- [ ] Dashboard de fornecedores problemáticos
- [ ] IA aprende com correções manuais
