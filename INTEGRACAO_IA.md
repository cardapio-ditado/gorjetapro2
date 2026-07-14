# Integração de IA para Extração de Notas Fiscais

## ⚠️ CONFIGURAÇÃO OBRIGATÓRIA

Antes de usar as funcionalidades de IA, você **DEVE** configurar a chave da API OpenAI:

### Como Configurar

1. **Obter chave**: Acesse [platform.openai.com](https://platform.openai.com) → API Keys → Create new secret key
2. **Configurar no Supabase**:
   - Vá em Settings → Edge Functions → Add Secret
   - Nome: `OPENAI_API_KEY`
   - Valor: Sua chave (formato `sk-...`)
   - Salve

**Sem esta configuração, as funções de IA não funcionarão!**

---

## Visão Geral
Sistema completo de extração automática de dados de notas fiscais e pedidos usando OpenAI GPT-4o Vision, integrado diretamente na aba de Compras do sistema.

## Tecnologias Utilizadas
- **OpenAI GPT-4o**: Modelo de visão para extração de dados
- **Supabase Edge Functions**: Backend serverless
- **Supabase Storage**: Armazenamento de arquivos
- **React + TypeScript**: Frontend
- **Structured Outputs**: JSON Schema para validação

## Funcionalidades

### 1. Upload de Arquivos
- **Formatos aceitos**: JPG, PNG, WebP, PDF
- **Tamanho máximo**: 20MB
- **Preview visual**: Para imagens
- **Drag & Drop**: Interface intuitiva

### 2. Extração Automática
A IA extrai automaticamente:
- **Dados do Fornecedor**:
  - Nome
  - CNPJ (com formatação)
- **Dados do Documento**:
  - Número da NF
  - Série
  - Data de emissão
- **Itens**:
  - Descrição
  - Código (se disponível)
  - Quantidade
  - Unidade de medida
  - Valor unitário
  - Valor total
  - Desconto
- **Totais**:
  - Valor dos produtos
  - Descontos
  - Valor total

### 3. Validação e Conferência
- **Validação automática**: Soma dos itens vs total da nota
- **Alerta de divergência**: Quando diferença > R$ 0,50
- **Edição manual**: Todos os campos podem ser ajustados
- **Adicionar/remover itens**: Flexibilidade total

### 4. Processamento Inteligente
- **Auto-criação de fornecedores**: Se não existir, cria automaticamente
- **Auto-criação de itens**: Novos produtos são cadastrados
- **Matching inteligente**: Busca por itens similares antes de criar
- **Deduplicação**: Hash SHA-256 para evitar duplicatas

### 5. Auditoria e Rastreabilidade
- Todos os requests/responses salvos
- Tokens consumidos registrados
- Tempo de processamento
- Link para arquivo original no Storage
- Níveis de confiança por campo

## Estrutura do Banco de Dados

### Campos Adicionados em `entradas_compras`
```sql
origem_arquivo_url  text      -- URL assinada do arquivo no Storage
origem_hash         text      -- SHA-256 para deduplicação
ia_confidences      jsonb     -- Níveis de confiança (0-1) por campo
```

### Nova Tabela: `ai_extractions`
```sql
id                    uuid      PRIMARY KEY
entrada_compra_id     uuid      FOREIGN KEY (pode ser NULL)
arquivo_url           text      URL do arquivo
arquivo_hash          text      Hash do arquivo
request_payload       jsonb     Dados da requisição
response_payload      jsonb     Resposta da IA
model_used            text      Modelo usado (gpt-4o)
tokens_used           integer   Tokens consumidos
processing_time_ms    integer   Tempo de processamento
success               boolean   Status da extração
error_message         text      Mensagem de erro (se houver)
created_at            timestamp Data da extração
created_by            uuid      Usuário que fez a extração
```

## Edge Function: `extract-nota`

### Endpoint
```
POST https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/extract-nota
```

### Headers
```
Authorization: Bearer {SUPABASE_ANON_KEY}
Content-Type: multipart/form-data
```

### Request
```
FormData:
  file: File (JPG, PNG, WebP, PDF até 20MB)
```

### Response
```json
{
  "success": true,
  "extraction_id": "uuid",
  "file": {
    "name": "nota.jpg",
    "size": 1234567,
    "type": "image/jpeg",
    "hash": "abc123...",
    "url": "https://..."
  },
  "extracted": {
    "emitente": {
      "nome": "Fornecedor Exemplo",
      "cnpj": "12.345.678/0001-90"
    },
    "documento": {
      "numero": "123456",
      "serie": "1",
      "data_emissao": "2025-01-15"
    },
    "itens": [
      {
        "descricao": "Produto A",
        "codigo": "COD001",
        "quantidade": 10,
        "unidade": "UN",
        "valor_unitario": 15.50,
        "valor_total": 155.00,
        "desconto": 0
      }
    ],
    "totais": {
      "valor_produtos": 155.00,
      "valor_descontos": 0,
      "valor_total": 155.00
    },
    "observacoes": null,
    "confidences": {
      "emitente": 0.98,
      "documento": 0.95,
      "itens": 0.97,
      "totais": 0.99
    }
  },
  "validation": {
    "somaItens": 155.00,
    "total": 155.00,
    "diferenca": 0.00
  },
  "meta": {
    "tokens": 1234,
    "processingTime": 3500
  }
}
```

## Fluxo de Uso

1. **Usuário clica em "Importar com IA"** na aba Compras
2. **Seleciona arquivo** (foto ou PDF da nota)
3. **Clica em "Extrair Dados"**
4. **Aguarda processamento** (~3-5 segundos)
5. **Confere os dados extraídos**:
   - Edita campos se necessário
   - Adiciona/remove itens
   - Seleciona estoque de destino (obrigatório)
6. **Confirma e cria compra**
7. **Sistema processa**:
   - Cria/busca fornecedor
   - Cria/busca itens de estoque
   - Cria entrada de compra
   - Vincula auditoria
8. **Compra criada** com status "Pendente"

## Componentes React

### `ComprasIAModal.tsx`
Modal completo com:
- Upload de arquivos
- Preview de imagens
- Loading states
- Exibição dos dados extraídos
- Edição de todos os campos
- Validação em tempo real
- Gestão de itens (adicionar/remover/editar)

### `ComprasEstoque.tsx` (modificado)
- Novo botão "Importar com IA" com gradiente roxo/azul
- Integração do modal de IA
- Processamento e salvamento dos dados
- Criação automática de fornecedores e itens

## Configuração de Ambiente

### Variáveis de Ambiente (.env)
```bash
VITE_SUPABASE_URL=https://nzdiojmrukdxavrdazot.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
OPENAI_API_KEY=sk-proj-J3PdF8n-5V4LLY...
```

### Secrets da Edge Function (já configurados automaticamente)
- `OPENAI_API_KEY`: Chave da API OpenAI
- `SUPABASE_URL`: URL do Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key

## Storage Bucket

### Nome: `notas-fiscais`
- **Visibilidade**: Privado
- **Estrutura**: `YYYY-MM-DD/{hash}.{ext}`
- **Retenção**: URLs assinadas válidas por 1 ano
- **Criação automática**: Criado na primeira execução

## Segurança

### RLS (Row Level Security)
- ✅ Todas as tabelas com RLS habilitado
- ✅ Políticas para usuários autenticados
- ✅ Tabela de auditoria protegida

### Validações
- ✅ Tamanho máximo de arquivo (20MB)
- ✅ Tipos de arquivo permitidos
- ✅ Validação de estrutura JSON (Structured Outputs)
- ✅ Hash para deduplicação

### Edge Function
- ✅ CORS configurado
- ✅ JWT não obrigatório (público para usuários do sistema)
- ✅ Tratamento de erros robusto
- ✅ Logs detalhados

## Custos Estimados (OpenAI)

### GPT-4o Vision
- **Input**: ~$2.50 / 1M tokens
- **Output**: ~$10.00 / 1M tokens
- **Por nota**: ~1.000-2.000 tokens (~$0.02-$0.05)

### Estimativa Mensal (100 notas/mês)
- **Tokens**: ~150.000 tokens
- **Custo**: ~$3-5/mês

## Melhorias Futuras

1. **OCR Fallback**: Tesseract.js para casos de falha
2. **Múltiplas páginas**: Suporte a PDF multi-página
3. **Templates**: Aprendizado de padrões por fornecedor
4. **Validação automática**: Checagem com SEFAZ
5. **Webhook**: Notificação de processamento
6. **Batch processing**: Múltiplos arquivos de uma vez
7. **Histórico**: Dashboard de extrações

## Troubleshooting

### Erro: "Arquivo muito grande"
- Verifique se arquivo < 20MB
- Comprima imagem antes do upload

### Erro: "OpenAI API error"
- Verifique se OPENAI_API_KEY está configurada
- Verifique saldo da conta OpenAI
- Verifique rate limits

### Erro: "Falha ao salvar compra"
- Verifique se estoque de destino foi selecionado
- Verifique logs no Supabase
- Verifique RLS policies

### Dados extraídos incorretos
- Melhore qualidade da imagem
- Certifique-se que texto está legível
- Use edição manual para corrigir

## Suporte

Para problemas ou dúvidas:
1. Verifique logs da Edge Function no Supabase
2. Verifique tabela `ai_extractions` para auditoria
3. Verifique console do navegador para erros React
