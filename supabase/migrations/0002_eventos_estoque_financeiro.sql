-- RR Bares — eventos como hub: estoque por área + financeiro estruturado
-- (fornecedores, produtos, categorias, contas, áreas de evento, movimentações,
--  contas a pagar/receber e extrato bancário para conciliação OFX)
-- Já aplicada no projeto Supabase em uso; mantida aqui como referência.

create table public.rr_fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj_cpf text,
  telefone text,
  email text,
  pix text,
  obs text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table public.rr_fornecedores is 'RR Bares: fornecedores (ficha para o financeiro).';

create table public.rr_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text not null default 'un',
  categoria text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table public.rr_produtos is 'RR Bares: produtos controlados no estoque dos eventos.';

create table public.rr_fin_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('receita','despesa')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table public.rr_fin_categorias is 'RR Bares: categorias de receitas e despesas.';

create table public.rr_fin_contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  banco text,
  tipo text not null default 'banco' check (tipo in ('banco','caixa')),
  saldo_inicial numeric(14,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table public.rr_fin_contas is 'RR Bares: contas bancárias e caixas físicos.';

create table public.rr_evento_areas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.rr_eventos(id) on delete cascade,
  nome text not null,
  is_recebimento boolean not null default false,
  criado_em timestamptz not null default now()
);
create index rr_evento_areas_evento_idx on public.rr_evento_areas (evento_id);
comment on table public.rr_evento_areas is 'RR Bares: áreas de estoque dentro de um evento (container, pista, camarote...).';

create table public.rr_estoque_movs (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.rr_eventos(id) on delete cascade,
  produto_id uuid not null references public.rr_produtos(id),
  tipo text not null check (tipo in ('entrada','transferencia','saida','perda')),
  origem_area_id uuid references public.rr_evento_areas(id) on delete cascade,
  destino_area_id uuid references public.rr_evento_areas(id) on delete cascade,
  quantidade numeric(14,3) not null check (quantidade > 0),
  obs text,
  criado_em timestamptz not null default now(),
  constraint rr_estoque_movs_areas_chk check (
    (tipo = 'entrada' and destino_area_id is not null and origem_area_id is null)
    or (tipo = 'transferencia' and origem_area_id is not null and destino_area_id is not null)
    or (tipo in ('saida','perda') and origem_area_id is not null and destino_area_id is null)
  )
);
create index rr_estoque_movs_evento_idx on public.rr_estoque_movs (evento_id);
comment on table public.rr_estoque_movs is 'RR Bares: movimentações de estoque do evento (entrada no container, transferências entre áreas, saídas e perdas).';

create table public.rr_fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar','receber')),
  descricao text not null,
  fornecedor_id uuid references public.rr_fornecedores(id),
  categoria_id uuid references public.rr_fin_categorias(id),
  evento_id uuid references public.rr_eventos(id),
  conta_id uuid references public.rr_fin_contas(id),
  valor numeric(14,2) not null check (valor > 0),
  data_vencimento date not null,
  data_pagamento date,
  status text not null default 'aberto' check (status in ('aberto','pago','cancelado')),
  obs text,
  criado_em timestamptz not null default now()
);
create index rr_fin_lancamentos_status_idx on public.rr_fin_lancamentos (status, data_vencimento);
create index rr_fin_lancamentos_evento_idx on public.rr_fin_lancamentos (evento_id);
comment on table public.rr_fin_lancamentos is 'RR Bares: contas a pagar e a receber (da central ou vinculadas a um evento).';

create table public.rr_fin_extrato (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.rr_fin_contas(id) on delete cascade,
  fitid text not null,
  data date not null,
  descricao text,
  valor numeric(14,2) not null,
  lancamento_id uuid references public.rr_fin_lancamentos(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (conta_id, fitid)
);
comment on table public.rr_fin_extrato is 'RR Bares: extrato bancário importado (OFX) para conciliação.';

alter table public.rr_fornecedores enable row level security;
alter table public.rr_produtos enable row level security;
alter table public.rr_fin_categorias enable row level security;
alter table public.rr_fin_contas enable row level security;
alter table public.rr_evento_areas enable row level security;
alter table public.rr_estoque_movs enable row level security;
alter table public.rr_fin_lancamentos enable row level security;
alter table public.rr_fin_extrato enable row level security;

create policy "rr auth select" on public.rr_fornecedores for select to authenticated using (true);
create policy "rr auth write" on public.rr_fornecedores for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_produtos for select to authenticated using (true);
create policy "rr auth write" on public.rr_produtos for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_fin_categorias for select to authenticated using (true);
create policy "rr auth write" on public.rr_fin_categorias for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_fin_contas for select to authenticated using (true);
create policy "rr auth write" on public.rr_fin_contas for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_evento_areas for select to authenticated using (true);
create policy "rr auth write" on public.rr_evento_areas for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_estoque_movs for select to authenticated using (true);
create policy "rr auth write" on public.rr_estoque_movs for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_fin_lancamentos for select to authenticated using (true);
create policy "rr auth write" on public.rr_fin_lancamentos for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_fin_extrato for select to authenticated using (true);
create policy "rr auth write" on public.rr_fin_extrato for all to authenticated using (true) with check (true);

insert into public.rr_fin_categorias (nome, tipo) values
  ('Bebidas','despesa'),
  ('Insumos & Descartáveis','despesa'),
  ('Logística & Combustível','despesa'),
  ('Pessoal & Freelancers','despesa'),
  ('Estrutura & Equipamentos','despesa'),
  ('Taxas & Impostos','despesa'),
  ('Outras despesas','despesa'),
  ('Venda de bar','receita'),
  ('Cachê / Contrato','receita'),
  ('Patrocínio','receita'),
  ('Outras receitas','receita');
