# Guia de Uso: SearchableSelect

O componente `SearchableSelect` é um campo de seleção com busca integrada que substitui os `<select>` tradicionais para melhorar a experiência do usuário.

## Como Usar

### 1. Importar o Componente

```tsx
import { SearchableSelect } from '../common/SearchableSelect';
```

### 2. Uso Básico

```tsx
<SearchableSelect
  options={[
    { value: '1', label: 'Opção 1' },
    { value: '2', label: 'Opção 2' },
    { value: '3', label: 'Opção 3' }
  ]}
  value={selectedValue}
  onChange={setSelectedValue}
  placeholder="Selecione uma opção..."
/>
```

### 3. Com Label e Campo Obrigatório

```tsx
<SearchableSelect
  label="Fornecedor"
  options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
  value={fornecedorId}
  onChange={setFornecedorId}
  placeholder="Selecione um fornecedor..."
  required
/>
```

### 4. Com Sublabel (informação adicional)

```tsx
<SearchableSelect
  options={itens.map(item => ({
    value: item.id,
    label: item.nome,
    sublabel: `Código: ${item.codigo} | Unidade: ${item.unidade}`
  }))}
  value={itemId}
  onChange={setItemId}
  placeholder="Selecione um item..."
/>
```

### 5. Com Mensagem de Erro

```tsx
<SearchableSelect
  label="Colaborador"
  options={colaboradores}
  value={colaboradorId}
  onChange={setColaboradorId}
  error={errors.colaboradorId}
  required
/>
```

## Propriedades

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `options` | `Option[]` | Array de opções (value, label, sublabel opcional) |
| `value` | `string` | Valor selecionado atualmente |
| `onChange` | `(value: string) => void` | Callback quando o valor muda |
| `placeholder` | `string` | Texto placeholder |
| `label` | `string` | Label do campo |
| `disabled` | `boolean` | Se o campo está desabilitado |
| `required` | `boolean` | Se o campo é obrigatório |
| `className` | `string` | Classes CSS adicionais |
| `error` | `string` | Mensagem de erro |
| `emptyMessage` | `string` | Mensagem quando não há resultados |

## Recursos

- **Busca Inteligente**: Busca no label e sublabel
- **Navegação por Teclado**:
  - ↑↓ para navegar
  - Enter para selecionar
  - Esc para fechar
  - Espaço para abrir
- **Limpar Seleção**: Botão X para limpar
- **Auto-focus**: Campo de busca recebe foco automaticamente
- **Responsivo**: Funciona em mobile e desktop
- **Acessível**: Suporta navegação por teclado completa

## Exemplos de Conversão

### Antes (select tradicional):
```tsx
<select
  value={fornecedorId}
  onChange={(e) => setFornecedorId(e.target.value)}
  className="w-full..."
>
  <option value="">Selecione...</option>
  {fornecedores.map(f => (
    <option key={f.id} value={f.id}>{f.nome}</option>
  ))}
</select>
```

### Depois (SearchableSelect):
```tsx
<SearchableSelect
  options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
  value={fornecedorId}
  onChange={setFornecedorId}
  placeholder="Selecione..."
/>
```

## Onde Usar

Use SearchableSelect em substituição a `<select>` quando:

- Lista tem mais de 5-10 itens
- Usuário precisa buscar por nome
- Experiência do usuário é importante
- Lista pode crescer com o tempo

## Já Implementado

### Estoque
- **ComprasEstoque**:
  - Filtro de fornecedores
  - Seleção de fornecedor no formulário
  - Seleção de estoque de destino
  - Seleção de itens de estoque (com código, nome e unidade)

- **MovimentacoesEstoque**:
  - Seleção de estoque de origem
  - Seleção de estoque de destino
  - Seleção de fichas técnicas (com custo)
  - Seleção de itens (com estoque, quantidade disponível e unidade)

- **RequisicoesInternas**:
  - Filtro de status
  - Seleção de estoque de origem
  - Seleção de estoque de destino
  - Seleção de itens (com quantidade disponível)

- **ProducaoEstoque**:
  - Filtro de status
  - Seleção de ficha técnica
  - Seleção de responsável
  - Seleção de estoque destino

## Próximos Passos

Implementar em:

### Estoque
- FichasTecnicas (seleção de insumos)
- ContagemEstoque (seleção de itens)
- ItensEstoque (seleção de categorias, fornecedores)

### Recursos Humanos
- ColaboradoresRH (seleção de cargos, departamentos)
- EscalasTrabalho (seleção de colaboradores)
- ExtrasFreelancers (seleção de colaboradores)
- FeriasColaboradores (seleção de colaboradores)
- GorjetaGarcons (seleção de garçons)
- OcorrenciasColaborador (seleção de colaboradores)

### Financeiro
- ContasPagar (seleção de fornecedores, categorias)
- ContasReceber (seleção de clientes, categorias)
- BaixaContasPagar (seleção de contas, formas de pagamento)
- FluxoCaixa (seleção de categorias, centros de custo)
- FinancialCategories (seleção de categoria pai)

### Recrutamento
- GestaoCargos (seleção de departamentos)
- GestaoVagas (seleção de cargos)
- GestaoCandidaturas (seleção de vagas, candidatos)
- BancoTalentos (seleção de cargos, habilidades)

### Eventos
- Events (seleção de tipos, locais)

### Solicitações
- SolicitacaoForm (seleção de categorias, prioridades)
