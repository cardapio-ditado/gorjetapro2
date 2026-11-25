-- Contador de acessos das páginas públicas (Kadu, 25/11/2026): links da bio (/links) e Vale Ditado (/vale).
-- Registra só a abertura da página e o clique em cada botão, com a origem (instagram, whatsapp, utm...),
-- o tipo de aparelho e um código aleatório da aba (para contar pessoas sem guardar dado pessoal: sem IP,
-- sem nome, sem CPF). A página grava pela função fn_site_registrar; o admin lê pela fn_site_acessos.

create table if not exists site_cliques (
  id bigint generated always as identity primary key,
  pagina text not null,            -- 'links' | 'vale'
  alvo text,                       -- null = abriu a página; senão, o botão ou passo ('vale', 'reservar', 'checkout'...)
  origem text not null default 'direto',
  dispositivo text not null default 'celular',
  sessao text not null,            -- código aleatório da aba do navegador
  criado_em timestamptz not null default now()
);
create index if not exists site_cliques_criado_idx on site_cliques (criado_em);
create index if not exists site_cliques_sessao_idx on site_cliques (sessao, pagina, alvo, criado_em);
alter table site_cliques enable row level security;
revoke all on site_cliques from anon, authenticated;

create or replace function fn_site_registrar(p_pagina text, p_alvo text, p_origem text, p_dispositivo text, p_sessao text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_alvo text := nullif(left(lower(btrim(coalesce(p_alvo, ''))), 40), '');
  v_sessao text := left(btrim(coalesce(p_sessao, '')), 40);
begin
  if p_pagina not in ('links', 'vale') or v_sessao !~ '^[A-Za-z0-9_-]{8,40}$' then return; end if;
  if v_alvo is not null and v_alvo !~ '^[a-z0-9_-]+$' then return; end if;
  -- o mesmo passo da mesma aba conta uma vez a cada 30 minutos (recarregar a página não infla o número)
  if exists (select 1 from site_cliques where sessao = v_sessao and pagina = p_pagina and alvo is not distinct from v_alvo
             and criado_em > now() - interval '30 minutes') then return; end if;
  insert into site_cliques (pagina, alvo, origem, dispositivo, sessao)
  values (p_pagina, v_alvo,
          coalesce(nullif(left(lower(regexp_replace(coalesce(p_origem, ''), '[^a-zA-Z0-9_-]', '', 'g')), 40), ''), 'direto'),
          case when p_dispositivo = 'computador' then 'computador' else 'celular' end,
          v_sessao);
end $$;
revoke all on function fn_site_registrar(text, text, text, text, text) from public;
grant execute on function fn_site_registrar(text, text, text, text, text) to anon, authenticated;

-- Resumo para o admin do vale (só gerente). p_dias: 1 = hoje, 7 = últimos 7 dias, 0 = tudo.
create or replace function fn_site_acessos(p_dias int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ini timestamptz;
begin
  if not fn_vale_pode(true) then raise exception 'sem permissão'; end if;
  v_ini := case when coalesce(p_dias, 0) <= 0 then '-infinity'::timestamptz
                else ((now() at time zone 'America/Cuiaba')::date - (p_dias - 1)) at time zone 'America/Cuiaba' end;
  return jsonb_build_object(
    'links_pessoas', (select count(distinct sessao) from site_cliques where pagina = 'links' and alvo is null and criado_em >= v_ini),
    'links_cliques', (select coalesce(jsonb_agg(x order by x.pessoas desc), '[]') from (
        select alvo, count(*) cliques, count(distinct sessao) pessoas from site_cliques
         where pagina = 'links' and alvo is not null and criado_em >= v_ini group by alvo) x),
    'vale_pessoas', (select count(distinct sessao) from site_cliques where pagina = 'vale' and alvo is null and criado_em >= v_ini),
    'vale_checkout', (select count(distinct sessao) from site_cliques where pagina = 'vale' and alvo = 'checkout' and criado_em >= v_ini),
    'vale_pix', (select count(distinct sessao) from site_cliques where pagina = 'vale' and alvo = 'pagamento' and criado_em >= v_ini),
    'pedidos_pagos', (select count(*) from vale_pedidos where status = 'pago' and pago_em >= v_ini
                        and coalesce(origem->>'utm_source', '') <> 'teste-interno'),
    'vale_origem', (select coalesce(jsonb_agg(x order by x.pessoas desc), '[]') from (
        select origem, count(distinct sessao) pessoas from site_cliques
         where pagina = 'vale' and alvo is null and criado_em >= v_ini group by origem) x),
    'por_dia', (select coalesce(jsonb_agg(x order by x.dia desc), '[]') from (
        select (criado_em at time zone 'America/Cuiaba')::date dia,
               count(distinct sessao) filter (where pagina = 'links' and alvo is null) links,
               count(distinct sessao) filter (where pagina = 'links' and alvo = 'vale') clique_vale,
               count(distinct sessao) filter (where pagina = 'vale' and alvo is null) vale,
               count(distinct sessao) filter (where pagina = 'vale' and alvo = 'checkout') checkout
          from site_cliques where criado_em >= v_ini group by 1) x),
    'celular_pct', (select round(100.0 * count(*) filter (where dispositivo = 'celular') / nullif(count(*), 0))
                      from site_cliques where alvo is null and criado_em >= v_ini)
  );
end $$;
revoke all on function fn_site_acessos(int) from public, anon;
grant execute on function fn_site_acessos(int) to authenticated;
