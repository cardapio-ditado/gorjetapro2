# Correção: Despesas Manuais Não Aparecendo

## Problemas Identificados e Corrigidos

### 1. Campo `status` não estava sendo salvo
**Problema:** A função `criarDespesa` não estava enviando explicitamente o campo `status` no insert.
**Solução:** Adicionado `status: 'ativa'` explicitamente no insert.

### 2. Campos duplicados de categoria
**Problema:** A tabela tem tanto `categoria_id` (text) quanto `categoria_financeira_id` (uuid), causando confusão.
**Solução:** Agora salvamos em ambos os campos para garantir compatibilidade:
```typescript
categoria_id: despesa.categoria_id,
categoria_financeira_id: despesa.categoria_id,
```

### 3. Filtro por semana inadequado
**Problema:** O filtro `despesasManuaisFiltradas` estava filtrando por `semana_id`, mas despesas agora são baseadas em `data_vencimento`.
**Solução:** Removido o filtro por semana, mostrando todas as despesas manuais independente da semana:
```typescript
// ANTES
const despesasManuaisFiltradas = semanaAtual
  ? despesasManuais.filter(d => d.semana_id === semanaAtual.id)
  : [];

// DEPOIS
const despesasManuaisFiltradas = despesasManuais;
```

### 4. Falta de validação e feedback
**Problema:** Erros silenciosos não informavam o usuário sobre problemas.
**Solução:** Adicionadas validações explícitas e alertas de sucesso/erro:
- Validação de valor
- Validação de fornecedor
- Validação de categoria
- Validação de data de vencimento
- Alert de sucesso após salvar
- Alert de erro com detalhes

### 5. Data padrão inadequada
**Problema:** Data de vencimento padrão era hoje, mas despesas geralmente são para o futuro.
**Solução:** Mudado padrão para 7 dias à frente:
```typescript
data_vencimento: dayjs().add(7, 'days').format('YYYY-MM-DD')
```

## Testes Recomendados

Após essas correções, teste:

1. **Cadastro de Despesa Manual**
   - Acesse: Visão Estratégica → Despesas → Despesas Lançadas
   - Clique em "Nova Despesa Manual"
   - Preencha todos os campos
   - Verifique se aparece o alert de sucesso
   - Verifique se a despesa aparece na tabela

2. **Visualização**
   - Confirme que a despesa aparece na aba "Despesas Lançadas"
   - Verifique se o status está como "Ativa" (badge verde)
   - Confirme que o valor está correto
   - Verifique se a categoria está mostrando corretamente

3. **Cálculo de Totais**
   - Verifique se o total da tabela está correto
   - Confirme que apenas despesas ativas são contabilizadas

4. **Ações**
   - Teste cancelar uma despesa (botão X)
   - Verifique se muda para status "Cancelada"
   - Teste reativar (botão ✓)
   - Teste excluir definitivamente (botão 🗑️)

## Mudanças nos Arquivos

### `src/services/visaoEstrategica.ts`
- ✅ Adicionado campo `status` explícito no insert
- ✅ Salvando em ambos campos de categoria
- ✅ Adicionado console.error para debugging
- ✅ Melhor tratamento de erro

### `src/pages/VisaoEstrategica.tsx`
- ✅ Removido filtro por semana nas despesas manuais
- ✅ Adicionadas validações antes de salvar
- ✅ Alerts de sucesso/erro
- ✅ Data padrão 7 dias à frente
- ✅ Resetando categoria_id corretamente após salvar

## Próximos Passos

Se as despesas ainda não aparecerem:

1. Abra o console do navegador (F12) e verifique erros
2. Tente cadastrar uma despesa e veja se há erros no console
3. Verifique se o usuário tem permissão RLS para inserir na tabela
4. Execute no Supabase SQL Editor:
   ```sql
   SELECT * FROM visao_estrategica_despesas
   WHERE status = 'ativa'
   ORDER BY criado_em DESC
   LIMIT 5;
   ```
5. Verifique se as despesas estão sendo salvas no banco

## Status

✅ Correções implementadas
✅ Build passando sem erros
⏳ Aguardando teste no ambiente
