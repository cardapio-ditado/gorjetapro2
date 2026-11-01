-- Extrato bancário automático (Conta Stone pela Pluggy / Meu Pluggy).
--
-- - banco_integracoes: a conta conectada na Pluggy (item + account) ligada a uma
--   conta de bancos_contas. A função pluggy-sync grava aqui o resultado de cada leitura.
-- - banco_extrato: cada movimento da conta, uma vez só (externo_id = id da Pluggy).
--   Entra já classificado pelas regras (trigger), e as saídas que precisam de
--   decisão ficam 'pendente' para a tela de Conciliação Bancária.
-- - banco_regras: o que o sistema aprendeu ("CNPJ X é o fornecedor Y",
--   "Reserva Stone é movimento interno").
-- Acesso: quem tem o módulo Financeiro (fn_financeiro_pode) ou master.

create or replace function public.fn_financeiro_pode()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.ativo and (
      u.nivel = 'master'
      or exists (
        select 1 from permissoes_usuario p
          join modulos_sistema m on m.id = p.modulo_id
         where p.usuario_id = u.id and m.slug in ('finance', 'financeiro') and p.pode_visualizar)
    )
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$$;

-- Conta Stone no cadastro de bancos
insert into bancos_contas (banco, tipo_conta, numero_conta, agencia, titular, documento_titular, saldo_inicial, saldo_atual, status)
select 'Stone', 'corrente', '77623213-3', '0001', 'Ditado Popular', '23.718.514/0001-82', 0, 0, 'ativo'
where not exists (select 1 from bancos_contas where numero_conta = '77623213-3');

create table if not exists public.banco_integracoes (
  id uuid primary key default gen_random_uuid(),
  provedor text not null default 'pluggy',
  nome text not null,
  item_id text not null,
  account_id text not null unique,
  banco_conta_id uuid not null references bancos_contas(id),
  ativo boolean not null default true,
  saldo numeric,
  saldo_em timestamptz,
  item_status text,
  consentimento_expira_em timestamptz,
  ultimo_sync_em timestamptz,
  ultimo_sync_ok boolean,
  ultimo_erro text,
  ultimo_resumo jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.banco_regras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sentido text check (sentido in ('credito', 'debito')),          -- null = os dois
  campo text not null check (campo in ('documento', 'descricao')),
  padrao text not null,                                            -- documento: só dígitos; descrição: padrão ILIKE
  classe text not null check (classe in ('interno', 'receita_cartao', 'receita_pix', 'receita_outros', 'fornecedor', 'pessoa', 'tarifa', 'outros')),
  acao text not null default 'sugerir' check (acao in ('automatico', 'sugerir', 'ignorar')),
  fornecedor_id uuid references fornecedores(id),
  categoria_id uuid references categorias_financeiras(id),
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create unique index if not exists banco_regras_unica on public.banco_regras (campo, padrao, coalesce(sentido, '')) where ativo;

create table if not exists public.banco_extrato (
  id uuid primary key default gen_random_uuid(),
  integracao_id uuid references banco_integracoes(id),
  banco_conta_id uuid not null references bancos_contas(id),
  externo_id text not null unique,
  data date not null,
  data_hora timestamptz not null,
  valor numeric(14,2) not null check (valor >= 0),
  sentido text not null check (sentido in ('credito', 'debito')),
  operacao text,
  descricao text,
  contraparte_nome text,
  contraparte_doc text,
  contraparte_doc_tipo text,
  doc_digitos text generated always as (nullif(regexp_replace(coalesce(contraparte_doc, ''), '\D', '', 'g'), '')) stored,
  categoria_provedor text,
  classe text not null default 'outros',
  status text not null default 'pendente' check (status in ('pendente', 'automatica', 'conciliada', 'ignorada')),
  regra_id uuid references banco_regras(id),
  fornecedor_id uuid references fornecedores(id),
  categoria_id uuid references categorias_financeiras(id),
  conta_pagar_id uuid,
  resolvido_por uuid,
  resolvido_em timestamptz,
  payload jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists banco_extrato_data on public.banco_extrato (banco_conta_id, data);
create index if not exists banco_extrato_pend on public.banco_extrato (status) where status = 'pendente';

-- Classificação: regra (documento antes de descrição); sem regra, CNPJ do
-- fornecedor cadastrado, depois CNPJ/CPF; entradas sem regra ficam para conferir.
create or replace function public.fn_banco_classificar(e banco_extrato)
returns banco_extrato language plpgsql stable set search_path = public as $$
declare r banco_regras; f uuid;
  -- a coluna gerada doc_digitos ainda não existe no BEFORE INSERT: calcula aqui
  doc text := nullif(regexp_replace(coalesce(e.contraparte_doc, ''), '\D', '', 'g'), '');
begin
  select * into r from banco_regras g
   where g.ativo and (g.sentido is null or g.sentido = e.sentido)
     and ((g.campo = 'documento' and g.padrao = doc)
       or (g.campo = 'descricao' and e.descricao ilike g.padrao))
   order by (g.campo = 'documento') desc, g.criado_em desc
   limit 1;

  e.regra_id := r.id;
  if r.id is not null then
    e.classe := r.classe;
    e.fornecedor_id := r.fornecedor_id;
    e.categoria_id := r.categoria_id;
    e.status := case r.acao when 'automatico' then 'automatica' when 'ignorar' then 'ignorada' else 'pendente' end;
    return e;
  end if;

  e.fornecedor_id := null; e.categoria_id := null;
  e.status := 'pendente';
  if e.sentido = 'credito' then
    e.classe := 'receita_outros';
  elsif doc is not null and length(doc) = 14 then
    select fo.id into f from fornecedores fo
     where fo.status = 'ativo' and regexp_replace(coalesce(fo.cnpj, ''), '\D', '', 'g') = doc
     limit 1;
    e.classe := 'fornecedor';
    e.fornecedor_id := f;
    if f is not null then
      select fo.categoria_padrao_id into e.categoria_id from fornecedores fo where fo.id = f;
    end if;
  elsif doc is not null then
    e.classe := 'pessoa';
  else
    e.classe := 'outros';
  end if;
  return e;
end $$;

create or replace function public.trg_banco_extrato_classificar()
returns trigger language plpgsql set search_path = public as $$
begin
  new := fn_banco_classificar(new);
  return new;
end $$;

drop trigger if exists banco_extrato_classificar on public.banco_extrato;
create trigger banco_extrato_classificar before insert on public.banco_extrato
  for each row execute function trg_banco_extrato_classificar();

-- Reaplica as regras nos movimentos ainda pendentes (depois de criar uma regra).
create or replace function public.fn_banco_reclassificar()
returns integer language plpgsql security definer set search_path = public as $$
declare e banco_extrato; n integer := 0;
begin
  if not fn_financeiro_pode() and auth.role() <> 'service_role' then
    raise exception 'Sem acesso ao financeiro';
  end if;
  for e in select * from banco_extrato where status = 'pendente' loop
    e := fn_banco_classificar(e);
    update banco_extrato set classe = e.classe, status = e.status, regra_id = e.regra_id,
           fornecedor_id = e.fornecedor_id, categoria_id = e.categoria_id
     where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Regras iniciais (formato das descrições da Conta Stone)
insert into banco_regras (nome, sentido, campo, padrao, classe, acao) values
  ('Reserva Stone (guarda e resgate automáticos)', null, 'descricao', 'Reserva Stone%', 'interno', 'automatico'),
  ('Antecipação de recebíveis', 'credito', 'descricao', 'Antecipação |%', 'receita_cartao', 'automatico'),
  ('Liquidação de vendas no cartão', 'credito', 'descricao', '%liquidação de suas vendas%', 'receita_cartao', 'automatico'),
  ('Pix recebido na maquininha', 'credito', 'descricao', 'Pix | Maquininha%', 'receita_pix', 'automatico')
on conflict do nothing;

-- Integração da Conta Stone (Meu Pluggy). Ids da Pluggy não são credenciais.
insert into banco_integracoes (nome, item_id, account_id, banco_conta_id)
select 'Stone PJ', '31a02b2f-fc62-4d7d-9059-f0761ceff82f', 'f82da2dc-297b-4d9a-bcf0-817ab66bfd95', b.id
  from bancos_contas b where b.numero_conta = '77623213-3'
on conflict (account_id) do nothing;

alter table public.banco_integracoes enable row level security;
alter table public.banco_extrato enable row level security;
alter table public.banco_regras enable row level security;

create policy banco_integracoes_ler on public.banco_integracoes for select to authenticated using (fn_financeiro_pode());
create policy banco_extrato_ler on public.banco_extrato for select to authenticated using (fn_financeiro_pode());
create policy banco_extrato_resolver on public.banco_extrato for update to authenticated using (fn_financeiro_pode()) with check (fn_financeiro_pode());
create policy banco_regras_acesso on public.banco_regras for all to authenticated using (fn_financeiro_pode()) with check (fn_financeiro_pode());

-- Leitura automática 2x por dia (07h40 e 13h40 em Cuiabá). O Meu Pluggy atualiza 1x por dia.
select cron.schedule('pluggy-extrato-sync', '40 11,17 * * *', $c$
  select net.http_post(
    url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/pluggy-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select valor #>> '{}' from public.agente_config where chave = 'token_teste')),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$c$);
