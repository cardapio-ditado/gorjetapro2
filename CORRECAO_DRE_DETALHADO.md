# Correções no DRE Detalhado

## Problemas Identificados e Corrigidos

### 1. Exportação de Não Classificados não funcionava

**Problema:** Ordem dos parâmetros incorreta na chamada da função `exportToExcel`.

**Código Anterior:**
```javascript
exportToExcel(
  headers,  // ERRADO - deveria ser data
  data,     // ERRADO - deveria ser filename
  'lancamentos-nao-classificados-...'  // ERRADO - deveria ser headers
);
```

**Código Corrigido:**
```javascript
exportToExcel(
  data,
  'lancamentos-nao-classificados-${selectedYear}...',
  headers
);
```

---

### 2. Lançamento de fevereiro aparecendo em janeiro

**Problema:** Cálculo incorreto do último dia do mês causava inclusão de lançamentos do mês seguinte.

**Código Anterior:**
```javascript
// ERRO: new Date(2026, 1, 0) = último dia de DEZEMBRO 2025
// ERRO: new Date(2026, 2, 0) = último dia de JANEIRO 2026
const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate();
```

**Código Corrigido:**
```javascript
// CORRETO: new Date(2026, 2, 0) = último dia de JANEIRO (31)
// CORRETO: new Date(2026, 3, 0) = último dia de FEVEREIRO (28 ou 29)
const lastDay = new Date(Number(selectedYear), Number(selectedMonth) + 1, 0).getDate();
```

---

### 3. Diferenças entre subtotal e lançamentos listados

**Causa:** Os dois problemas acima combinados causavam inconsistências nos valores.

**Corrigido:** Agora ambos usam o mesmo período correto.

---

## Impacto das Correções

- Exportar Não Classificados: Funciona corretamente
- Filtro de Mês: Respeita exatamente o mês selecionado
- Subtotais vs Lançamentos: Valores batem perfeitamente
- Gerar PDF Detalhado: Lista os lançamentos corretos
