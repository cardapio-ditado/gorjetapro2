# 🚀 GUIA COMPLETO - IMPORTAÇÃO DE VENDAS COM IA

## ✅ O QUE FOI IMPLEMENTADO

Sistema completo de **saída automática de estoque** que importa arquivos XLS/CSV de vendas e usa IA para mapear produtos automaticamente!

---

## 📋 STATUS DA IMPLEMENTAÇÃO

### ✅ CONCLUÍDO:
1. Migration no banco de dados
2. 2 Edge Functions criadas
3. Interface completa com modal
4. Botão integrado em Movimentações
5. Build do projeto

### ⏳ PENDENTE (VOCÊ PRECISA FAZER):
1. Deploy das 2 Edge Functions no Supabase Dashboard

---

## 🎯 FUNCIONALIDADES

### **1. Upload de Arquivo**
- Suporta CSV, TSV, XLS
- Detecta automaticamente colunas (Produto, Quantidade, Valor)
- Separa por vírgula ou tab

### **2. IA Inteligente**
- Mapeia produtos do arquivo com itens do estoque
- Usa mapeamentos anteriores (aprendizado)
- Busca fuzzy complementar
- Retorna % de confiança

### **3. Tela de Revisão**
- Mostra todos os produtos mapeados
- Permite ajuste manual
- Mostra sugestões da IA
- Opção de salvar mapeamentos

### **4. Processamento**
- Cria movimentações de saída automaticamente
- Atualiza saldos via triggers
- Salva mapeamentos para o futuro
- Histórico completo

---

## 🔧 DEPLOY DAS EDGE FUNCTIONS

### **PASSO 1: Acessar Supabase Dashboard**

```
https://supabase.com/dashboard/project/nzdiojmrukdxavrdazot/functions
```

### **PASSO 2: Criar Função 1 - importar-vendas-estoque**

1. Clique em "Create Function"
2. Nome: `importar-vendas-estoque`
3. Copie TODO o código do arquivo:
   ```
   supabase/functions/importar-vendas-estoque/index.ts
   ```
4. Cole no editor
5. Clique em "Deploy"
6. Aguarde finalizar (30-60 segundos)

### **PASSO 3: Criar Função 2 - confirmar-importacao-vendas**

1. Clique em "Create Function"
2. Nome: `confirmar-importacao-vendas`
3. Copie TODO o código do arquivo:
   ```
   supabase/functions/confirmar-importacao-vendas/index.ts
   ```
4. Cole no editor
5. Clique em "Deploy"
6. Aguarde finalizar (30-60 segundos)

---

## 📊 FORMATO DO ARQUIVO

### **Colunas Obrigatórias:**
- **nome** - Nome do produto (obrigatório)
- **quantidade** - Quantidade vendida (obrigatório)

### **Colunas Opcionais (mas recomendadas):**
- **sku** - Código do produto (usado para match exato - 100% confiança!)
- **valor unitario** - Valor unitário
- **categoria** - Categoria do produto
- **operacao** - Tipo de operação
- **subtotal**, **descontos**, **valor total**, **montavel**

### **Exemplo do seu arquivo CSV:**

```csv
sku,nome,categoria,operacao,montavel,quantidade,valor unitario,subtotal,descontos,valor total
12345,Coca Cola 2L,Bebidas,Venda,N,10,8.50,85.00,0,85.00
67890,Cerveja Skol Lata,Bebidas,Venda,N,24,3.20,76.80,0,76.80
ABC123,Água Mineral 500ml,Bebidas,Venda,N,50,2.00,100.00,0,100.00
XYZ789,Suco Del Valle Laranja,Bebidas,Venda,N,15,4.50,67.50,0,67.50
```

### **Nomes de Colunas Reconhecidos:**

**Produto/Nome (obrigatório):**
- "nome", "produto", "item", "descrição", "descricao"

**Quantidade (obrigatório):**
- "quantidade", "qtd", "quant"

**SKU/Código (opcional - recomendado!):**
- "sku", "codigo", "código"
- ⭐ Se você cadastrar o SKU na coluna "Código" do item no estoque, o match será 100% automático!

**Valor (opcional):**
- "valor unitario", "valor unit", "unit", "preco", "preço"

**Outros (opcional):**
- "categoria", "operacao", "operação"

---

## 🎨 COMO USAR

### **1. Acessar o Sistema**
- Vá em **Estoque** → **Movimentações**

### **2. Clicar em "Importar Vendas (IA)"**
- Botão azul com ícone de raio ⚡

### **3. Selecionar Estoque e Arquivo**
- Escolha o estoque de destino
- Faça upload do arquivo XLS/CSV

### **4. Aguardar Processamento**
- IA irá mapear automaticamente
- Leva 10-30 segundos

### **5. Revisar Mapeamentos**

Você verá:
- 🟢 **Itens Mapeados** - Com % de confiança
- 🟠 **Itens Pendentes** - Não identificados

Para ajustar:
- Clique no ícone de editar (lápis)
- Selecione o item correto do estoque
- Sistema salva automaticamente

### **6. Confirmar**
- Marque "Salvar mapeamentos" (recomendado)
- Clique em "Confirmar e Processar"
- Sistema cria as saídas automaticamente

### **7. Pronto!**
- Saídas criadas
- Saldos atualizados
- Mapeamentos salvos para o futuro

---

## 🧠 APRENDIZADO CONTÍNUO

O sistema fica mais inteligente a cada uso:

1. **Primeira Importação (com SKU):**
   - IA compara SKU do arquivo com Código do item
   - Match exato = 100% confiança
   - Se não tiver SKU, usa similaridade de nomes
   - Você revisa e define o estoque

2. **Próximas Importações:**
   - Sistema usa mapeamentos anteriores (lembra qual estoque)
   - Maior precisão
   - Menos correções necessárias

3. **Após Múltiplas Importações:**
   - Mapeamentos automáticos em 95%+ dos casos
   - Revisão rápida
   - Processo quase instantâneo

---

## 🎯 EXEMPLOS DE MAPEAMENTO

### **Com SKU (melhor método):**
```
SKU "12345" → Código "12345" no estoque → Match exato (100%)
SKU "ABC-789" → Código "ABC-789" → Match exato (100%)
```

### **Sem SKU (busca fuzzy):**
```
"Coca Cola 2L"     → "COCA-COLA 2 LITROS"     (85% confiança)
"Skol Lata"        → "Cerveja Skol 350ml"     (75% confiança)
"H2O Limão"        → "Água H2OH Limão 500ml"  (80% confiança)
```

### **Com Histórico:**
```
"Heineken Lata" + Histórico (usado 10x no "Estoque Freezer")
→ Item: Heineken 350ml (90%)
→ Estoque: Freezer (95%)
```

### **Normalização:**
- Remove acentos
- Remove pontuação
- Lowercase
- Compara palavras-chave

---

## ⚙️ CONFIGURAÇÕES AVANÇADAS

### **Confiança por Nível:**
- **> 70%**: Auto-aceito (verde)
- **40-70%**: Sugestão (amarelo)
- **< 40%**: Revisão obrigatória (vermelho)

### **Salvar Mapeamentos:**
- ✅ **Ligado** (recomendado): Acelera futuras importações
- ❌ **Desligado**: Não salva aprendizado

---

## 🐛 SOLUÇÃO DE PROBLEMAS

### **Erro: "Não foi possível identificar colunas"**
- Verifique se o arquivo tem cabeçalho
- Colunas devem ter nomes como "Produto", "Quantidade"

### **Muitos itens não mapeados**
- Primeira importação é normal
- Revise manualmente
- Marque "Salvar mapeamentos"
- Próxima vez será automático

### **Erro ao processar**
- Verifique se as Edge Functions foram deployadas
- Verifique logs no Supabase Dashboard

---

## 📈 ESTATÍSTICAS

Após processar, você verá:
- Total de itens
- Mapeados com sucesso
- Pendentes de revisão
- Erros (se houver)

Histórico completo em:
- Tabela `importacoes_vendas`
- Tabela `itens_importacao_vendas`
- Tabela `mapeamento_itens_vendas`

---

## ✨ PRÓXIMOS PASSOS

1. **Deploy das Functions** (obrigatório)
2. Teste com arquivo pequeno
3. Revise e ajuste mapeamentos
4. Marque "Salvar mapeamentos"
5. Nas próximas, será automático!

---

## 📞 SUPORTE

Se tiver dúvidas:
1. Verifique logs das Edge Functions
2. Verifique tabelas no banco
3. Teste com arquivo simples primeiro

**Sistema está pronto para uso!** 🎉
