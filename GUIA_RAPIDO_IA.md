# 🚀 GUIA RÁPIDO - IMPORTAÇÃO DE VENDAS COM IA

## 📄 FORMATOS SUPORTADOS

✅ **XML** - Nota fiscal eletrônica (NF-e), cupom fiscal
✅ **PDF** - Relatório de vendas do PDV/sistema

---

## 🎯 COMO FUNCIONA

### **1. XML (Nota Fiscal)**
```
Sistema lê automaticamente:
- <xProd> = Nome do produto
- <cProd> = Código/SKU
- <qCom> = Quantidade
- <vUnCom> = Valor unitário

Tags alternativas também funcionam!
```

### **2. PDF (Relatório)**
```
IA analisa visualmente o PDF e extrai:
- Nomes dos produtos
- Quantidades vendidas
- Códigos/SKU (se tiver)
- Valores (se tiver)
```

---

## 📋 PROCESSO COMPLETO

### **1. Upload do Arquivo**
- Clique em "Importar Vendas IA"
- Selecione arquivo XML ou PDF
- Sistema detecta formato automaticamente

### **2. Processamento Automático**

**Para XML:**
```
1. Lê estrutura do XML
2. Extrai produtos, códigos e quantidades
3. Envia para IA mapear com estoque
```

**Para PDF:**
```
1. IA lê documento visualmente
2. Identifica produtos e quantidades
3. Envia para IA mapear com estoque
```

### **3. Mapeamento Inteligente**

A IA faz 3 análises:

**Análise 1 - Match por Código (100%)**
```
SKU do arquivo = Código no estoque
→ Match perfeito, confiança 100%
```

**Análise 2 - Histórico (90%)**
```
Já importou esse produto antes?
→ Usa mesmo item e estoque da última vez
→ Confiança alta
```

**Análise 3 - Similaridade (40-90%)**
```
Compara nomes inteligentemente
"Coca Cola 2L" ≈ "COCA-COLA 2 LITROS"
→ Match fuzzy, confiança variável
```

### **4. Revisão Manual**

Você vê cada item:
```
🟢 Coca Cola 2L
   ✓ COCA-COLA 2 LITROS (100%)
   🏢 Estoque Bar (95%)
   [Editar]

🟠 Produto Desconhecido
   ⚠ Não mapeado
   [Definir produto e estoque]
```

### **5. Confirmação**
- Sistema cria saídas automaticamente
- Salva aprendizado para próxima vez
- Atualiza saldos

---

## 🎓 APRENDIZADO

O sistema fica mais inteligente:

**1ª Importação:**
```
"Heineken Lata" → Você define manualmente
                → Estoque: Freezer
                → Sistema salva: ✓
```

**2ª Importação:**
```
"Heineken Lata" → Sistema lembra!
                → Sugere: Freezer (90%)
                → Você confirma: ✓
```

**10ª Importação:**
```
"Heineken Lata" → Automático!
                → Freezer (98%)
                → Sem revisão: ✓
```

---

## 💡 DICAS

### **Para XML:**
✅ Funciona com NF-e padrão brasileiro
✅ Lê múltiplas notas em um XML
✅ Extrai dados estruturados

### **Para PDF:**
✅ Use PDF com texto (não imagem)
✅ Tabelas organizadas funcionam melhor
✅ IA pode demorar mais (analisa visualmente)

### **Para Cadastro:**
⭐ **Cadastre códigos/SKU nos itens!**
- Item no estoque: Código = "12345"
- XML traz: cProd = "12345"
- Match automático 100%!

---

## ⚡ EXEMPLO REAL

### **Seu XML de Vendas:**
```xml
<det>
  <prod>
    <cProd>12345</cProd>
    <xProd>COCA-COLA PET 2L</xProd>
    <qCom>10</qCom>
    <vUnCom>8.50</vUnCom>
  </prod>
</det>
```

### **Cadastro no Estoque:**
```
Item: COCA-COLA 2 LITROS
Código: 12345
Estoque: Bar
```

### **Resultado:**
```
✅ Match automático por código!
   Produto: COCA-COLA 2 LITROS (100%)
   Estoque: Bar (histórico 95%)
   Saída: 10 unidades
```

---

## 🚨 ERROS COMUNS

### **"Nenhum produto encontrado"**
- XML não tem estrutura padrão
- PDF está como imagem
- Arquivo corrompido

**Solução:** Verifique se o arquivo é válido

### **"Muitos itens pendentes"**
- Produtos não cadastrados no estoque
- Nomes muito diferentes

**Solução:** Cadastre produtos ou revise manualmente

---

## ✅ CHECKLIST

- [ ] Arquivo é XML ou PDF de vendas
- [ ] Itens já cadastrados no estoque
- [ ] Códigos preenchidos (opcional)
- [ ] Primeira importação revista
- [ ] Sistema aprendendo!

**Pronto para usar!** 🎉
