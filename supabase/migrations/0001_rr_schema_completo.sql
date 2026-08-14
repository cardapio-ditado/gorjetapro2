-- RR Bares — schema completo (cadastros, viagens, prestação de contas, storage)
-- Execute no projeto Supabase do RR Bares (SQL Editor ou via MCP).

create table public.rr_funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apelido text,
  telefone text,
  funcao text,
  tipo text not null default 'freelancer' check (tipo in ('fixo','freelancer')),
  pix text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table public.rr_funcionarios is 'RR Bares: colaboradores fixos e freelancers.';

create table public.rr_veiculos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  placa text,
  modelo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table public.rr_veiculos is 'RR Bares: veículos usados nas viagens de preparação.';

create table public.rr_eventos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text,
  local text,
  data_inicio date,
  data_fim date,
  status text not null default 'planejado' check (status in ('planejado','em_andamento','encerrado','cancelado')),
  obs text,
  criado_em timestamptz not null default now()
);
comment on table public.rr_eventos is 'RR Bares: eventos de bar & show.';

create table public.rr_viagens (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references public.rr_eventos(id),
  funcionario_id uuid not null references public.rr_funcionarios(id),
  veiculo_id uuid references public.rr_veiculos(id),
  data_partida date not null,
  data_retorno_prevista date,
  data_retorno_real date,
  valor_alocado numeric(12,2) not null default 0 check (valor_alocado >= 0),
  status text not null default 'em_viagem' check (status in ('em_viagem','prestacao_pendente','fechada','cancelada')),
  obs text,
  criado_por uuid,
  token_publico uuid not null default gen_random_uuid(),
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);
comment on table public.rr_viagens is 'RR Bares: dinheiro alocado para colaborador em viagem de preparação de evento.';
create unique index rr_viagens_token_publico_idx on public.rr_viagens (token_publico);
create index rr_viagens_status_idx on public.rr_viagens (status);
create index rr_viagens_arquivada_idx on public.rr_viagens (arquivada);

create table public.rr_viagem_lancamentos (
  id uuid primary key default gen_random_uuid(),
  viagem_id uuid not null references public.rr_viagens(id) on delete cascade,
  tipo text not null check (tipo in ('despesa','aporte','devolucao')),
  categoria text,
  descricao text,
  valor numeric(12,2) not null check (valor > 0),
  data_lancamento date not null default current_date,
  comprovante_url text,
  criado_por uuid,
  criado_via text not null default 'sistema' check (criado_via in ('sistema','link_publico')),
  criado_em timestamptz not null default now()
);
comment on table public.rr_viagem_lancamentos is 'RR Bares: lançamentos da prestação de contas (despesa/aporte/devolução) com foto do comprovante.';
create index rr_viagem_lancamentos_viagem_idx on public.rr_viagem_lancamentos (viagem_id);

create table public.rr_viagem_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  viagem_id uuid not null references public.rr_viagens(id) on delete cascade,
  descricao text not null,
  foto_url text,
  criado_via text not null default 'sistema' check (criado_via in ('sistema','link_publico')),
  criado_em timestamptz not null default now()
);
comment on table public.rr_viagem_ocorrencias is 'RR Bares: ocorrências da viagem (problema com veículo etc.) com foto opcional.';
create index rr_viagem_ocorrencias_viagem_idx on public.rr_viagem_ocorrencias (viagem_id);

-- RLS: acesso total para usuários autenticados (v1)
alter table public.rr_funcionarios enable row level security;
alter table public.rr_veiculos enable row level security;
alter table public.rr_eventos enable row level security;
alter table public.rr_viagens enable row level security;
alter table public.rr_viagem_lancamentos enable row level security;
alter table public.rr_viagem_ocorrencias enable row level security;

create policy "rr auth select" on public.rr_funcionarios for select to authenticated using (true);
create policy "rr auth write" on public.rr_funcionarios for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_veiculos for select to authenticated using (true);
create policy "rr auth write" on public.rr_veiculos for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_eventos for select to authenticated using (true);
create policy "rr auth write" on public.rr_eventos for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_viagens for select to authenticated using (true);
create policy "rr auth write" on public.rr_viagens for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_viagem_lancamentos for select to authenticated using (true);
create policy "rr auth write" on public.rr_viagem_lancamentos for all to authenticated using (true) with check (true);
create policy "rr auth select" on public.rr_viagem_ocorrencias for select to authenticated using (true);
create policy "rr auth write" on public.rr_viagem_ocorrencias for all to authenticated using (true) with check (true);

-- bucket de comprovantes (leitura pública, upload autenticado)
insert into storage.buckets (id, name, public)
values ('rr-comprovantes', 'rr-comprovantes', true)
on conflict (id) do nothing;

create policy "rr comprovantes leitura publica" on storage.objects
  for select using (bucket_id = 'rr-comprovantes');
create policy "rr comprovantes upload autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'rr-comprovantes');
create policy "rr comprovantes delete autenticado" on storage.objects
  for delete to authenticated using (bucket_id = 'rr-comprovantes');
