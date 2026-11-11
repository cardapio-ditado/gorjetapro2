-- Gorjeta Pro / Estoque Beta 2: FASE 0 (somente estrutura isolada)
-- NÃO aplicar em produção sem revisão, snapshot e plano de rollback.
-- NÃO inclui triggers, grants anon/authenticated nem qualquer escrita em dados oficiais.
-- As FKs para estoques/itens oficiais são apenas referência de catálogo.

create table if not exists public.beta2_runs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'sandbox' check (status in ('sandbox', 'homologacao', 'arquivado')),
  snapshot_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  notes text
);

create table if not exists public.beta2_locations (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.estoques(id),
  parent_id uuid references public.beta2_locations(id),
  code text not null unique,
  name text not null,
  storage_type text not null default 'seco'
    check (storage_type in ('seco', 'resfriado', 'congelado', 'operacional', 'terceiros')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.beta2_item_settings (
  item_id uuid primary key references public.itens_estoque(id),
  control_type text not null
    check (control_type in ('venda', 'ingrediente', 'preparacao', 'consumo_interno', 'patrimonial', 'terceiros', 'vasilhame')),
  base_unit text not null,
  package_factor numeric check (package_factor is null or package_factor > 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.beta2_kit_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  target_location_id uuid references public.beta2_locations(id),
  usage_sector text not null,
  replenishments_per_day integer not null default 1 check (replenishments_per_day > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.beta2_kit_items (
  kit_id uuid not null references public.beta2_kit_templates(id) on delete cascade,
  item_id uuid not null references public.itens_estoque(id),
  target_quantity numeric not null check (target_quantity >= 0),
  primary key (kit_id, item_id)
);

create table if not exists public.beta2_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.beta2_runs(id),
  event_type text not null check (event_type in (
    'receipt', 'transfer_out', 'transfer_in', 'internal_consumption',
    'production_input', 'production_output', 'sale', 'waste',
    'count_adjustment', 'location_move', 'loan_in', 'loan_out',
    'keg_connect', 'keg_disconnect', 'reversal'
  )),
  item_id uuid not null references public.itens_estoque(id),
  quantity_base numeric not null check (quantity_base > 0),
  uom_base text not null,
  from_stock_id uuid references public.estoques(id),
  to_stock_id uuid references public.estoques(id),
  from_location_id uuid references public.beta2_locations(id),
  to_location_id uuid references public.beta2_locations(id),
  effective_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_user_id uuid,
  authorized_by uuid,
  source_system text not null,
  source_document_type text,
  source_document_id text,
  source_line_id text,
  idempotency_key text not null,
  reason_code text,
  cost_snapshot numeric,
  reversal_of uuid references public.beta2_events(id),
  metadata jsonb not null default '{}'::jsonb,
  unique (run_id, idempotency_key)
);

create index if not exists beta2_events_run_item_time_idx
  on public.beta2_events(run_id, item_id, effective_at, recorded_at);
create index if not exists beta2_events_source_idx
  on public.beta2_events(source_system, source_document_type, source_document_id, source_line_id);

create table if not exists public.beta2_count_sessions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.beta2_runs(id),
  stock_id uuid not null references public.estoques(id),
  location_id uuid references public.beta2_locations(id),
  status text not null default 'aberta'
    check (status in ('aberta','contada','recontagem','aguardando_aprovacao','aprovada','cancelada')),
  started_at timestamptz not null default now(),
  counted_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  notes text
);

create table if not exists public.beta2_count_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.beta2_count_sessions(id),
  item_id uuid not null references public.itens_estoque(id),
  counted_quantity numeric not null check (counted_quantity >= 0),
  counted_at timestamptz not null,
  expected_at_count numeric,
  movement_after_count numeric,
  expected_at_approval numeric,
  approved_difference numeric,
  reason_code text,
  approval_note text,
  unique (session_id, item_id)
);

create table if not exists public.beta2_transfers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.beta2_runs(id),
  source_stock_id uuid not null references public.estoques(id),
  destination_stock_id uuid not null references public.estoques(id),
  status text not null default 'solicitada'
    check (status in ('solicitada','separada','entregue','parcial','recebida','rejeitada','cancelada')),
  requested_by uuid,
  separated_by uuid,
  delivered_by uuid,
  received_by uuid,
  received_at timestamptz,
  reason_code text,
  created_at timestamptz not null default now(),
  check (source_stock_id <> destination_stock_id)
);

create table if not exists public.beta2_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.beta2_transfers(id) on delete cascade,
  item_id uuid not null references public.itens_estoque(id),
  requested_quantity numeric not null check (requested_quantity >= 0),
  delivered_quantity numeric check (delivered_quantity is null or delivered_quantity >= 0),
  received_quantity numeric check (received_quantity is null or received_quantity >= 0),
  discrepancy_note text,
  unique (transfer_id, item_id)
);

-- RLS deliberadamente SEM policies; autorização fina será introduzida
-- após auditoria de auth/users/roles. service_role e SQL administrativo
-- poderão operar os dados de homologação, cliente não.
alter table public.beta2_runs enable row level security;
alter table public.beta2_locations enable row level security;
alter table public.beta2_item_settings enable row level security;
alter table public.beta2_kit_templates enable row level security;
alter table public.beta2_kit_items enable row level security;
alter table public.beta2_events enable row level security;
alter table public.beta2_count_sessions enable row level security;
alter table public.beta2_count_lines enable row level security;
alter table public.beta2_transfers enable row level security;
alter table public.beta2_transfer_lines enable row level security;

revoke all on public.beta2_runs from anon, authenticated;
revoke all on public.beta2_locations from anon, authenticated;
revoke all on public.beta2_item_settings from anon, authenticated;
revoke all on public.beta2_kit_templates from anon, authenticated;
revoke all on public.beta2_kit_items from anon, authenticated;
revoke all on public.beta2_events from anon, authenticated;
revoke all on public.beta2_count_sessions from anon, authenticated;
revoke all on public.beta2_count_lines from anon, authenticated;
revoke all on public.beta2_transfers from anon, authenticated;
revoke all on public.beta2_transfer_lines from anon, authenticated;
