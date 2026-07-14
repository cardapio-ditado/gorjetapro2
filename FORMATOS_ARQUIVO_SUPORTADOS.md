# 📄 FORMATOS DE ARQUIVO SUPORTADOS

## ✅ FORMATO CORRETO DO SEU ARQUIVO

Seu arquivo deve ter estas colunas (em qualquer ordem):

### **Obrigatórias:**
- `nome` - Nome do produto
- `quantidade` - Quantidade vendida

### **Opcionais (mas recomendadas):**
- `sku` - Código do produto
- `valor unitario` - Valor
- `categoria` - Categoria
- `operacao` - Tipo de operação
- Outras: subtotal, descontos, valor total, montavel

---

## 📝 SEPARADORES SUPORTADOS

O sistema detecta automaticamente:

1. **Vírgula (,)** - CSV padrão
2. **Ponto-e-vírgula (;)** - CSV Excel BR
3. **Tab (\t)** - TSV

---

## ✅ EXEMPLO CORRETO

```csv
sku,nome,categoria,operacao,montavel,quantidade,valor unitario,subtotal,descontos,valor total
12345,Coca Cola 2L,Bebidas,Venda,N,10,8.50,85.00,0,85.00
67890,Skol Lata,Bebidas,Venda,N,24,3.20,76.80,0,76.80
```

---

## ❌ PROBLEMAS COMUNS

### **1. Arquivo com coluna "pk" apenas**

**Problema:** O arquivo não foi salvo corretamente como CSV.

**Solução:**
1. Abra o arquivo no Excel/LibreOffice
2. Vá em "Salvar Como"
3. Escolha **"CSV (separado por vírgulas)"**
4. Salve novamente

### **2. Colunas não reconhecidas**

**Problema:** As colunas têm nomes diferentes.

**Verificar:**
- Primeira linha tem os nomes das colunas?
- Tem coluna com nome do produto?
- Tem coluna com quantidade?

**Nomes aceitos:**
```
Produto: nome, produto, item, descrição
Quantidade: quantidade, qtd, quant
```

### **3. Separador errado**

**Problema:** Sistema não detecta as colunas.

**Solução:**
1. Abra o arquivo em editor de texto (Notepad)
2. Veja como as colunas estão separadas
3. Se for vírgula, ponto-vírgula ou tab: OK
4. Se for outro caractere: salve como CSV padrão

---

## 🔧 COMO SALVAR CORRETAMENTE

### **Excel:**
1. Arquivo → Salvar Como
2. Tipo: **CSV (separado por vírgulas) (*.csv)**
3. Salvar

### **Google Sheets:**
1. Arquivo → Download
2. Escolher: **Valores separados por vírgula (.csv)**

### **LibreOffice:**
1. Arquivo → Salvar Como
2. Tipo: **Texto CSV (.csv)**
3. Separador de campo: **vírgula (,)**
4. Salvar

---

## 🧪 TESTE RÁPIDO

**Abra o arquivo em Notepad e veja a primeira linha:**

✅ **Correto:**
```
sku,nome,categoria,operacao,montavel,quantidade,valor unitario,subtotal,descontos,valor total
```

❌ **Errado:**
```
pk
```

ou

```
"sku";"nome";"categoria"  (com aspas em tudo)
```

---

## 💡 DICA

Use a coluna **sku** para match 100% automático!

Cadastre o mesmo código no campo "Código" do item no estoque.
