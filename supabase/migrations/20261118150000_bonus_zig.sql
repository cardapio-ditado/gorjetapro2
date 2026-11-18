-- Bônus da ZIG (Kadu, 18/11/2026): cada transação paga em bônus, por pessoa, para
-- descontar do salário de funcionário (vai para o RH da Central) ou abater da
-- permuta de parceiro. A taxa de serviço conta; funcionário paga o valor cheio.
-- O documento (CPF) fica só no banco: a tela e a Central leem pelas funções,
-- que devolvem nome e valores, nunca o documento.

insert into public.modulos_sistema (nome, slug, icone, cor, ordem, ativo)
values ('Bônus ZIG', 'bonus_zig', 'Gift', 'from-amber-600 to-orange-800', 14, true)
on conflict (slug) do nothing;

create or replace function public.fn_bonus_pode()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select u.ativo and (u.nivel = 'master' or exists (
      select 1 from permissoes_usuario p join modulos_sistema m on m.id = p.modulo_id
       where p.usuario_id = u.id and m.slug = 'bonus_zig' and p.aba_id is null and p.pode_visualizar))
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$$;
revoke execute on function public.fn_bonus_pode() from public, anon;
grant execute on function public.fn_bonus_pode() to authenticated;

-- Quem usa bônus. chave: o documento; sem documento, o cartão (Anônimo); sem os dois, o nome.
create table if not exists public.zig_bonus_pessoas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  documento text,
  tipo text not null default 'nao_identificado'
    check (tipo in ('funcionario', 'parceiro', 'cortesia', 'nao_identificado')),
  colaborador_id uuid references public.colaboradores(id),
  permuta_tipo text check (permuta_tipo in ('mensal', 'total')),
  permuta_valor numeric(12,2),
  permuta_inicio date,
  obs text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table public.zig_bonus_pessoas enable row level security;
revoke all on public.zig_bonus_pessoas from anon, authenticated;

-- Uma linha por transação paga em bônus (lista de compradores da ZIG).
create table if not exists public.zig_bonus (
  id bigserial primary key,
  transacao text not null unique,
  noite date not null,
  data timestamptz,
  pessoa_id uuid not null references public.zig_bonus_pessoas(id),
  nome text,
  chip text,
  consumo numeric(12,2) not null default 0,
  taxa numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists zig_bonus_noite on public.zig_bonus (noite);
create index if not exists zig_bonus_pessoa on public.zig_bonus (pessoa_id, noite);
alter table public.zig_bonus enable row level security;
revoke all on public.zig_bonus from anon, authenticated;

-- Coletas feitas (para saber até onde o histórico já foi puxado).
create table if not exists public.zig_bonus_coletas (
  noite date primary key,
  transacoes int not null default 0,
  total numeric(12,2) not null default 0,
  coletado_em timestamptz not null default now(),
  erro text
);
alter table public.zig_bonus_coletas enable row level security;
revoke all on public.zig_bonus_coletas from anon, authenticated;

-- Grava uma noite vinda da ZIG (chamado pela função zig-bonus, com a chave de serviço).
-- p_itens: [{transacao, data, nome, documento, chip, consumo, taxa}]
create or replace function public.fn_bonus_gravar_noite(p_noite date, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  it jsonb; v_doc text; v_chip text; v_nome text; v_chave text; v_pessoa uuid; v_colab uuid;
  n int := 0; tot numeric := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_doc := nullif(regexp_replace(coalesce(it->>'documento', ''), '\D', '', 'g'), '');
    v_chip := nullif(btrim(coalesce(it->>'chip', '')), '');
    v_nome := coalesce(nullif(btrim(regexp_replace(coalesce(it->>'nome', ''), '\s+', ' ', 'g')), ''), 'Sem nome');
    v_chave := case when v_doc is not null then 'doc:' || v_doc when v_chip is not null then 'chip:' || v_chip else 'nome:' || lower(v_nome) end;
    v_pessoa := null; v_colab := null;
    select id into v_pessoa from zig_bonus_pessoas where chave = v_chave;
    if v_pessoa is null then
      select c.id into v_colab from colaboradores c
       where v_doc is not null and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = v_doc limit 1;
      insert into zig_bonus_pessoas (chave, nome, documento, tipo, colaborador_id)
      values (v_chave, initcap(lower(v_nome)), v_doc, case when v_colab is not null then 'funcionario' else 'nao_identificado' end, v_colab)
      on conflict (chave) do update set nome = zig_bonus_pessoas.nome
      returning id into v_pessoa;
    end if;
    insert into zig_bonus (transacao, noite, data, pessoa_id, nome, chip, consumo, taxa)
    values (it->>'transacao', p_noite, nullif(it->>'data', '')::timestamptz, v_pessoa, v_nome, v_chip,
            coalesce((it->>'consumo')::numeric, 0), coalesce((it->>'taxa')::numeric, 0))
    on conflict (transacao) do update set consumo = excluded.consumo, taxa = excluded.taxa, noite = excluded.noite;
    n := n + 1; tot := tot + coalesce((it->>'consumo')::numeric, 0) + coalesce((it->>'taxa')::numeric, 0);
  end loop;
  insert into zig_bonus_coletas (noite, transacoes, total, coletado_em, erro) values (p_noite, n, tot, now(), null)
  on conflict (noite) do update set transacoes = excluded.transacoes, total = excluded.total, coletado_em = now(), erro = null;
  return jsonb_build_object('noite', p_noite, 'transacoes', n, 'total', tot);
end $$;
revoke execute on function public.fn_bonus_gravar_noite(date, jsonb) from public, anon, authenticated;
grant execute on function public.fn_bonus_gravar_noite(date, jsonb) to service_role;

-- Resumo para a tela: cada pessoa com o consumo do mês e o saldo da permuta.
-- Mensal: valor − consumo do mês. Total (uma vez): valor − consumo desde o início.
create or replace function public.fn_bonus_resumo(p_mes date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_ini date := date_trunc('month', p_mes)::date; v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
begin
  if not fn_bonus_pode() then raise exception 'Sem acesso.'; end if;
  return jsonb_build_object(
    'mes', v_ini,
    'coleta', (select jsonb_build_object('de', min(noite), 'ate', max(noite), 'noites', count(*)) from zig_bonus_coletas where erro is null),
    'pessoas', coalesce((select jsonb_agg(x order by x.tipo_ordem, x.total desc, x.nome) from (
      select p.id, p.nome, p.tipo, p.permuta_tipo, p.permuta_valor, p.permuta_inicio, p.obs, p.colaborador_id is not null funcionario_cadastro,
             (case p.tipo when 'nao_identificado' then 0 when 'parceiro' then 1 when 'funcionario' then 2 else 3 end) tipo_ordem,
             coalesce(sum(b.consumo + b.taxa) filter (where b.noite between v_ini and v_fim), 0) total,
             coalesce(sum(b.consumo) filter (where b.noite between v_ini and v_fim), 0) consumo,
             coalesce(sum(b.taxa) filter (where b.noite between v_ini and v_fim), 0) taxa,
             count(b.id) filter (where b.noite between v_ini and v_fim) transacoes,
             count(distinct b.noite) filter (where b.noite between v_ini and v_fim) noites,
             case when p.tipo = 'parceiro' and p.permuta_tipo = 'total'
                  then p.permuta_valor - coalesce(sum(b.consumo + b.taxa) filter (where b.noite >= coalesce(p.permuta_inicio, '1900-01-01')), 0)
                  when p.tipo = 'parceiro' and p.permuta_tipo = 'mensal'
                  then p.permuta_valor - coalesce(sum(b.consumo + b.taxa) filter (where b.noite between v_ini and v_fim), 0) end saldo,
             (select jsonb_agg(jsonb_build_object('noite', n.noite, 'v', n.v) order by n.noite) from (
                select b2.noite, sum(b2.consumo + b2.taxa) v from zig_bonus b2 where b2.pessoa_id = p.id and b2.noite between v_ini and v_fim group by 1) n) por_noite
      from zig_bonus_pessoas p left join zig_bonus b on b.pessoa_id = p.id
      group by p.id) x where x.total > 0 or x.tipo = 'parceiro'), '[]'::jsonb));
end $$;
revoke execute on function public.fn_bonus_resumo(date) from public, anon;
grant execute on function public.fn_bonus_resumo(date) to authenticated;

-- Classificar uma pessoa (e cadastrar a permuta do parceiro).
create or replace function public.fn_bonus_classificar(p_id uuid, p_tipo text, p_permuta_tipo text default null,
  p_permuta_valor numeric default null, p_permuta_inicio date default null, p_obs text default null, p_nome text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not fn_bonus_pode() then raise exception 'Sem acesso.'; end if;
  if p_tipo not in ('funcionario', 'parceiro', 'cortesia', 'nao_identificado') then raise exception 'Tipo inválido.'; end if;
  if p_tipo = 'parceiro' and (p_permuta_tipo not in ('mensal', 'total') or coalesce(p_permuta_valor, 0) <= 0) then
    raise exception 'Parceiro precisa do valor da permuta e se é por mês ou uma vez só.';
  end if;
  update zig_bonus_pessoas set tipo = p_tipo,
    permuta_tipo = case when p_tipo = 'parceiro' then p_permuta_tipo end,
    permuta_valor = case when p_tipo = 'parceiro' then p_permuta_valor end,
    permuta_inicio = case when p_tipo = 'parceiro' then coalesce(p_permuta_inicio, permuta_inicio, current_date) end,
    obs = coalesce(p_obs, obs), nome = coalesce(nullif(btrim(p_nome), ''), nome),
    atualizado_em = now(), atualizado_por = (select nome_completo from usuarios_sistema where id = fn_usuario_sistema_id())
  where id = p_id;
  if not found then raise exception 'Pessoa não encontrada.'; end if;
end $$;
revoke execute on function public.fn_bonus_classificar(uuid, text, text, numeric, date, text, text) from public, anon;
grant execute on function public.fn_bonus_classificar(uuid, text, text, numeric, date, text, text) to authenticated;

-- Para o RH da Central: total do mês de cada funcionário (sem documento).
create or replace function public.fn_bonus_funcionarios_mes(p_mes date)
returns table (nome text, colaborador text, total numeric, noites bigint)
language sql stable security definer set search_path to 'public' as $$
  select p.nome, c.nome_completo, sum(b.consumo + b.taxa), count(distinct b.noite)
  from zig_bonus b join zig_bonus_pessoas p on p.id = b.pessoa_id left join colaboradores c on c.id = p.colaborador_id
  where p.tipo = 'funcionario' and b.noite between date_trunc('month', p_mes)::date and (date_trunc('month', p_mes) + interval '1 month - 1 day')::date
  group by p.nome, c.nome_completo order by 3 desc
$$;
revoke execute on function public.fn_bonus_funcionarios_mes(date) from public, anon, authenticated;

-- Coleta diária às 6h40 de Cuiabá (10h40 UTC): a noite anterior.
select cron.schedule('zig-bonus-coletar', '40 10 * * *', $cron$
  select net.http_post(
    url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/zig-bonus',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select valor #>> '{}' from public.agente_config where chave = 'token_teste')),
    body := '{"acao":"coletar"}'::jsonb, timeout_milliseconds := 60000)
$cron$);
