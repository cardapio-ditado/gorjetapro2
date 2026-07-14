# Sistema de Ciclo de Vida de Despesas Manuais

## Problema Identificado

Quando despesas são lançadas manualmente na Visão Estratégica (por imediatismo ou para planejamento), e posteriormente são formalizadas no módulo Contas a Pagar, ocorria **duplicidade nos cálculos**.

### Cenários Problemáticos:

1. **Imediatismo**: Setor lança despesa manual rapidamente → Financeiro cadastra formalmente no Contas a Pagar → Duplicidade
2. **Planejamento Futuro**: Compras lança despesa manual para controle de semana → Ao receber mercadoria, cria conta a pagar → Duplicidade

## Solução Implementada

Criamos um **Sistema de Ciclo de Vida** para despesas manuais com 3 status:

### Status das Despesas:

#### 1. **ATIVA** (padrão)
- Despesa provisória que **conta nos totais**
- Aparece nos cálculos de orçamento comprometido
- Pode ser cancelada ou convertida

#### 2. **CONVERTIDA**
- Despesa foi formalizada no Contas a Pagar
- **NÃO conta mais nos totais** (evita duplicidade)
- Mantém vínculo com a conta a pagar original
- Preservada para histórico e auditoria

#### 3. **CANCELADA**
- Despesa descartada/não necessária
- **NÃO conta nos totais**
- Pode ser reativada se necessário
- Preservada para auditoria

## Como Funciona

### 1. Cadastro de Despesa Manual

**Localização:** Visão Estratégica → Aba "Despesas" → Sub-aba "Despesas Lançadas"

**Campos:**
- Fornecedor/Descrição (obrigatório)
- Valor (obrigatório)
- **Data de Vencimento** (obrigatório) - permite lançar em semanas futuras
- Categoria (obrigatório)
- Subcategoria (opcional)
- Observações (opcional)

**Comportamento:**
- Status inicial: **ATIVA**
- Conta automaticamente nos cálculos da semana correspondente à data de vencimento
- Aparece no dashboard como "gasto comprometido"

### 2. Conversão para Contas a Pagar

**Quando fazer:**
- Despesa manual já foi formalizada no módulo Contas a Pagar
- Nota fiscal recebida e conta criada

**Como fazer:**
Use a função programática:
```typescript
await veService.converterDespesaEmContaPagar(
  despesaId,       // ID da despesa manual
  contaPagarId,    // ID da conta a pagar criada
  'Formalizada com NF 12345' // Observação opcional
);
```

**Resultado:**
- Status muda para **CONVERTIDA**
- Para de contar nos totais (evita duplicidade)
- Vínculo registrado com a conta a pagar
- Histórico preservado

### 3. Cancelamento de Despesa

**Quando fazer:**
- Despesa não será mais necessária
- Planejamento mudou
- Erro no lançamento

**Como fazer:**
- Na tabela de despesas, clique no botão "X" (cancelar)
- Ou programaticamente:
```typescript
await veService.cancelarDespesaManual(
  despesaId,
  'Fornecedor não entregará mais'
);
```

**Resultado:**
- Status muda para **CANCELADA**
- Para de contar nos totais
- Pode ser reativada depois se necessário

### 4. Reativação de Despesa

**Quando fazer:**
- Despesa cancelada precisa voltar a contar

**Como fazer:**
- Na tabela, clique no botão "✓" (check verde) ao lado da despesa cancelada
- Ou programaticamente:
```typescript
await veService.reativarDespesaManual(despesaId);
```

## Fluxo Completo - Exemplo Prático

### Cenário: Compra de Insumos

**Semana 1 - Planejamento:**
1. Setor de Compras prevê compra de R$ 5.000 em farinha para Semana 2
2. Lança **despesa manual**:
   - Fornecedor: "Moinho Central"
   - Valor: R$ 5.000
   - Vencimento: 15/03/2026 (Semana 2)
   - Status: **ATIVA** ✅
3. Dashboard mostra R$ 5.000 comprometidos para Semana 2

**Semana 2 - Recebimento:**
4. Mercadoria chega com nota fiscal
5. Financeiro cria **Conta a Pagar** formal:
   - NF: 98765
   - Valor: R$ 5.200 (com frete)
   - Vencimento: 20/03/2026
6. Sistema converte automaticamente (ou manualmente):
   ```typescript
   await veService.converterDespesaEmContaPagar(
     despesaManualId,
     contaPagarId,
     'Convertida - NF 98765'
   );
   ```
7. Despesa manual muda para **CONVERTIDA** 🔄
8. Dashboard agora mostra apenas os R$ 5.200 da conta a pagar
9. **SEM DUPLICIDADE!** ✅

## Campos no Banco de Dados

**Novos campos em `visao_estrategica_despesas`:**

```sql
status                text    -- 'ativa', 'convertida', 'cancelada'
conta_pagar_id        uuid    -- Vínculo com contas_pagar
observacao_conversao  text    -- Motivo da conversão/cancelamento
convertido_em         timestamp
convertido_por        uuid    -- Quem fez a ação
```

## Funções Disponíveis

### No Service (`visaoEstrategica.ts`)

```typescript
// Converter despesa manual em conta a pagar
await converterDespesaEmContaPagar(despesaId, contaPagarId, observacao?)

// Cancelar despesa manual
await cancelarDespesaManual(despesaId, motivo?)

// Reativar despesa cancelada
await reativarDespesaManual(despesaId)

// Buscar despesas (apenas ativas por padrão)
await getDespesas(semanaId?, incluirTodas?)
```

### Banco de Dados (RPC)

```sql
SELECT converter_despesa_manual_em_conta_pagar(despesa_id, conta_pagar_id, observacao);
SELECT cancelar_despesa_manual(despesa_id, motivo);
SELECT reativar_despesa_manual(despesa_id);
```

## Interface Visual

### Tabela de Despesas Manuais

Mostra todas as despesas com:
- Badge de status colorido:
  - 🟢 **ATIVA** (verde)
  - 🔵 **CONVERTIDA** (azul)
  - ⚫ **CANCELADA** (cinza)
- Ações contextuais:
  - Despesa ativa: Cancelar (X) ou Excluir (🗑️)
  - Despesa cancelada: Reativar (✓) ou Excluir (🗑️)
  - Despesa convertida: Apenas visualização

### Cálculos Automáticos

- **Total exibido na tabela**: Apenas despesas ATIVAS
- **Dashboard "Comprometido"**: Apenas despesas ATIVAS
- **Despesas convertidas/canceladas**: Preservadas para auditoria, mas não contam

## Benefícios da Solução

✅ **Elimina duplicidade** - Despesas convertidas param de contar automaticamente
✅ **Rastreabilidade completa** - Histórico preservado com timestamps e responsáveis
✅ **Flexibilidade** - Pode cancelar e reativar quando necessário
✅ **Auditoria** - Vínculo mantido entre despesa manual e conta a pagar
✅ **Planejamento futuro** - Pode lançar despesas para semanas futuras
✅ **Simplicidade** - Usuário não precisa se preocupar em excluir, apenas converter

## Migração de Dados Existentes

Todas as despesas existentes foram automaticamente marcadas como **ATIVA** (padrão).

Se houver despesas que já foram formalizadas no Contas a Pagar, você pode convertê-las manualmente usando a função `converterDespesaEmContaPagar`.

## Próximos Passos Sugeridos

### Automação Futura (Opcional)

Você pode criar uma trigger que automaticamente converte despesas manuais quando uma conta a pagar é criada com os mesmos dados:

```sql
-- Exemplo de trigger automática (não implementada ainda)
CREATE TRIGGER auto_converter_despesa_manual
AFTER INSERT ON contas_pagar
FOR EACH ROW
EXECUTE FUNCTION verificar_e_converter_despesa_manual();
```

Isso buscaria despesas manuais ativas com:
- Fornecedor similar
- Valor similar (±5%)
- Data de vencimento próxima (±7 dias)

E sugeriria ou faria a conversão automática.

## Suporte

Para dúvidas ou problemas, revise este documento ou consulte:
- Migration: `sistema_vinculacao_despesas_manuais.sql`
- Service: `src/services/visaoEstrategica.ts`
- Interface: `src/pages/VisaoEstrategica.tsx` (componente DespesasTab)
