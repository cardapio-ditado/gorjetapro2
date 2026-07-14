# Fase 3 - Aplicação dos Componentes UI em Todas as Páginas

## Estratégia de Aplicação

### Componentes a Aplicar:
1. **PageHeader** - Substituir todos os títulos de página
2. **KPICard** - Substituir cards de métricas/indicadores
3. **SectionCard** - Envolver seções de conteúdo
4. **Badge** - Substituir spans de status/categorias
5. **DataTable** - Substituir tabelas existentes

### Padrão de Aplicação:

```tsx
// ANTES
<div className="p-6">
  <h1 className="text-2xl font-bold mb-4">Título</h1>
  <div className="bg-white p-4 rounded shadow">
    <p>Valor: R$ 1000</p>
  </div>
</div>

// DEPOIS
import { PageHeader, KPICard, SectionCard } from '@/components/ui';

<div className="p-6">
  <PageHeader title="Título" subtitle="Descrição" />
  <KPICard label="Métrica" value={1000} format="currency" />
</div>
```

## Páginas a Atualizar (24 páginas)

### Dashboard & Home (3)
- [x] DashboardHome.tsx - Dashboard principal com KPIs
- [x] Dashboard.tsx - Dashboard geral
- [x] DashboardFinanceiro.tsx - Dashboard financeiro com gráficos

### Financeiro (4)
- [x] Finance.tsx - Página principal de finanças
- [x] Entradas.tsx - Controle de entradas
- [x] ZigRecebimentos.tsx - Recebimentos Zig
- [x] ZigVendasSync.tsx - Sincronização de vendas

### Estoque/Inventário (2)
- [x] AdvancedInventory.tsx - Gestão avançada de estoque
- [x] ListaCompras.tsx - Lista de compras

### RH & Colaboradores (3)
- [x] Staff.tsx - Gestão de colaboradores
- [x] Musicians.tsx - Gestão de músicos
- [x] Recruitment.tsx - Recrutamento

### Eventos & Marketing (2)
- [x] Events.tsx - Gestão de eventos
- [x] Marketing.tsx - Campanhas e marketing

### Solicitações (2)
- [x] Solicitacoes.tsx - Sistema de solicitações
- [x] SolicitacaoPublica.tsx - Formulário público

### Gestão Estratégica (3)
- [x] GestaoEstrategica.tsx - Visão estratégica
- [x] VisaoEstrategica.tsx - Planejamento
- [x] Ocorrencias.tsx - Registro de ocorrências

### Configurações & Outros (5)
- [x] Settings.tsx - Configurações do sistema
- [x] GeneralRegistrations.tsx - Cadastros gerais
- [x] ManualUsuario.tsx - Manual do usuário
- [x] PreEntrevista.tsx - Pré-entrevista
- [x] LoginPage.tsx - Página de login (se aplicável)

## Prioridades de Aplicação

### Alta Prioridade (uso diário):
1. DashboardHome
2. Finance
3. Staff
4. AdvancedInventory
5. Events

### Média Prioridade:
6. Dashboard
7. DashboardFinanceiro
8. Musicians
9. Marketing
10. Solicitacoes

### Baixa Prioridade (uso eventual):
11-24. Demais páginas

## Checklist de Cada Página:

- [ ] Adicionar imports dos componentes UI
- [ ] Substituir título por PageHeader
- [ ] Identificar e substituir cards de métricas por KPICard
- [ ] Envolver seções em SectionCard
- [ ] Substituir status/tags por Badge
- [ ] Substituir tabelas por DataTable
- [ ] Testar compilação
- [ ] Verificar responsividade

## Estimativa:
- 24 páginas × 15min = 6 horas de trabalho
- Build e testes: 1 hora
- **Total estimado: 7 horas**
