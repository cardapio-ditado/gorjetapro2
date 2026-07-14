# 🎯 SISTEMA DE MAPEAMENTO DE ITENS COM IA

## 📋 RESUMO

Sistema inteligente que aprende a mapear produtos de vendas para itens do estoque automaticamente.

---

## 🔍 MÉTODOS DE MAPEAMENTO (em ordem de prioridade)

### **1️⃣ Match por SKU (100% confiança)**

**Como funciona:**
- Compara coluna `sku` do arquivo com campo `codigo` do item no estoque
- Match exato = confiança 100%
- **Mais preciso e rápido**

**Exemplo:**
```
Arquivo:  sku="12345", nome="Coca Cola 2L"
Estoque:  codigo="12345", nome="COCA-COLA 2 LITROS"
Resultado: ✅ Match exato (100%)
```

**Para usar:**
1. No seu arquivo de vendas, tenha a coluna `sku`
2. No cadastro de itens do estoque, preencha o campo `Código`
3. Sistema fará match automático!

---

## 🏆 RECOMENDAÇÃO: USE SKU!

### **Por quê?**

**Com SKU = Importações 100% automáticas desde a primeira vez!**

---

## 📊 CONFIGURANDO SEU ARQUIVO

### **Estrutura do seu arquivo:**

```csv
sku,nome,categoria,operacao,montavel,quantidade,valor unitario,subtotal,descontos,valor total
12345,Coca Cola 2L,Bebidas,Venda,N,10,8.50,85.00,0,85.00
67890,Skol Lata 350ml,Bebidas,Venda,N,24,3.20,76.80,0,76.80
ABC123,Água Mineral,Bebidas,Venda,N,50,2.00,100.00,0,100.00
```

### **Colunas Reconhecidas:**
- ✅ `sku` - Código do produto (recomendado!)
- ✅ `nome` - Nome do produto (obrigatório)
- ✅ `quantidade` - Quantidade (obrigatório)
- `valor unitario` - Valor unitário
- `categoria` - Categoria
- `operacao` - Tipo de operação

---

## 🎓 CADASTRO NO ESTOQUE

### **Para aproveitar o SKU:**

1. Vá em **Estoque → Itens**
2. Ao cadastrar/editar item, preencha **campo "Código"**
3. Use o mesmo código que está no arquivo de vendas
4. Pronto!

---

## ✅ CHECKLIST

- [ ] Arquivo tem coluna `sku`
- [ ] Itens do estoque têm `codigo` preenchido
- [ ] Códigos são iguais no arquivo e estoque
- [ ] Primeira importação feita
- [ ] Mapeamentos salvos
- [ ] Próximas importações automáticas!

**Sistema pronto!** 🚀
