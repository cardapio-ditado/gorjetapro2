# Componentes UI - Gorjeta Pro

Biblioteca de componentes reutilizáveis com a identidade visual "Boteco Premium".

## Instalados na Fase 2

### 1. KPICard

Card para exibir indicadores-chave de desempenho com tipografia editorial.

**Props:**
- `label`: string - Rótulo do KPI (uppercase automático)
- `value`: string | number - Valor principal
- `variation?`: number - Variação percentual vs período anterior
- `icon?`: LucideIcon - Ícone do card
- `format?`: 'currency' | 'percent' | 'number' - Formato do valor
- `trend?`: 'up' | 'down' | 'neutral' - Tendência (afeta cor da variação)

**Exemplo:**
```tsx
import { KPICard } from '@/components/ui';
import { DollarSign } from 'lucide-react';

<KPICard
  label="Receita Total"
  value={45280.50}
  variation={12.5}
  icon={DollarSign}
  format="currency"
  trend="up"
/>
```

---

### 2. PageHeader

Cabeçalho padrão de página com título em Playfair Display e divisor dourado.

**Props:**
- `title`: string - Título principal (Playfair Display 32px)
- `subtitle?`: string - Subtítulo explicativo
- `actions?`: ReactNode - Botões/ações à direita
- `divider?`: boolean - Mostrar linha dourada separadora (default: true)

**Exemplo:**
```tsx
import { PageHeader } from '@/components/ui';

<PageHeader
  title="Financeiro"
  subtitle="Controle completo de receitas e despesas"
  actions={
    <>
      <button className="btn-secondary">Exportar</button>
      <button className="btn-primary">+ Nova Conta</button>
    </>
  }
/>
```

---

### 3. SectionCard

Card de seção com título opcional e área de conteúdo.

**Props:**
- `title?`: string - Título da seção (uppercase automático)
- `action?`: ReactNode - Ação/botão no header
- `children`: ReactNode - Conteúdo do card
- `className?`: string - Classes adicionais
- `noPadding?`: boolean - Remover padding interno (útil para tabelas)

**Exemplo:**
```tsx
import { SectionCard } from '@/components/ui';

<SectionCard
  title="Contas a Pagar"
  action={<button className="btn-primary">+ Nova</button>}
>
  <p>Conteúdo da seção...</p>
</SectionCard>
```

---

### 4. Badge

Badge com variantes semânticas e bordas.

**Props:**
- `children`: ReactNode - Conteúdo do badge
- `variant?`: 'success' | 'warning' | 'danger' | 'info' | 'default'
- `className?`: string - Classes adicionais

**Exemplo:**
```tsx
import { Badge } from '@/components/ui';

<Badge variant="success">Pago</Badge>
<Badge variant="warning">Pendente</Badge>
<Badge variant="danger">Atrasado</Badge>
<Badge variant="info">Em análise</Badge>
```

---

### 5. DataTable

Tabela com estilo Gorjeta Pro: header escuro, zebra wine, valores em DM Mono.

**Props:**
- `columns`: Column[] - Definição das colunas
- `data`: T[] - Array de dados
- `onRowClick?`: (row, index) => void - Callback ao clicar na linha
- `emptyMessage?`: string - Mensagem quando vazio
- `className?`: string - Classes adicionais
- `zebra?`: boolean - Linhas alternadas (default: true)

**Interface Column:**
```tsx
interface Column<T> {
  key: string;           // Chave do dado
  label: string;         // Texto do header
  render?: (value, row, index) => ReactNode;  // Renderização customizada
  align?: 'left' | 'center' | 'right';        // Alinhamento
  width?: string;        // Largura CSS
  isCurrency?: boolean;  // Formatar como R$
  isNumeric?: boolean;   // Formatar como número
}
```

**Exemplo:**
```tsx
import { DataTable, Column } from '@/components/ui';
import { Badge } from '@/components/ui';

const columns: Column[] = [
  { key: 'descricao', label: 'Descrição', align: 'left' },
  { key: 'valor', label: 'Valor', align: 'right', isCurrency: true },
  { key: 'vencimento', label: 'Vencimento', align: 'center' },
  {
    key: 'status',
    label: 'Status',
    align: 'center',
    render: (value) => (
      <Badge variant={value === 'pago' ? 'success' : 'warning'}>
        {value}
      </Badge>
    )
  }
];

const data = [
  { descricao: 'Fornecedor A', valor: 1250.00, vencimento: '10/04/2026', status: 'pago' },
  { descricao: 'Fornecedor B', valor: 890.50, vencimento: '15/04/2026', status: 'pendente' }
];

<DataTable
  columns={columns}
  data={data}
  onRowClick={(row) => console.log('Clicou em:', row)}
/>
```

---

## Uso Geral

Todos os componentes estão disponíveis via barrel export:

```tsx
import {
  KPICard,
  PageHeader,
  SectionCard,
  Badge,
  DataTable,
  type Column
} from '@/components/ui';
```

## Design System

Os componentes seguem automaticamente:
- **Tipografia**: Playfair Display (títulos), DM Sans (corpo), DM Mono (valores)
- **Cores**: Wine (#7D1F2C), Gold (#D4AF37), cores semânticas
- **Espaçamento**: Sistema 8px
- **Sombras**: Wine sutil, sem bordas pesadas

## Próximos Passos

Para aplicar totalmente o redesign, use estes componentes em:
- Dashboard (substituir cards atuais por KPICard)
- Páginas principais (adicionar PageHeader)
- Tabelas financeiras (substituir por DataTable)
- Status/tags (substituir por Badge)
