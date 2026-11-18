-- Bônus ZIG (Kadu, 18/11/2026): cartão por pessoa com tudo (produtos, mesa e
-- garçom de cada transação) e "já descontado" por transação ou pelo mês.
-- O RH da Central passa a ver só o que falta descontar.

alter table public.zig_bonus
  add column if not exists mesa text,
  add column if not exists garcom text,
  add column if not exists itens jsonb,
  add column if not exists descontado_em timestamptz,
  add column if not exists descontado_por text;

-- Grava a noite: agora com mesa, garçom e produtos. Não mexe em pessoa nem no descontado.
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
    insert into zig_bonus (transacao, noite, data, pessoa_id, nome, chip, consumo, taxa, mesa, garcom, itens)
    values (it->>'transacao', p_noite, nullif(it->>'data', '')::timestamptz, v_pessoa, v_nome, v_chip,
            coalesce((it->>'consumo')::numeric, 0), coalesce((it->>'taxa')::numeric, 0),
            nullif(it->>'mesa', ''), nullif(it->>'garcom', ''), nullif(it->'itens', 'null'::jsonb))
    on conflict (transacao) do update set consumo = excluded.consumo, taxa = excluded.taxa, noite = excluded.noite,
      mesa = coalesce(excluded.mesa, zig_bonus.mesa), garcom = coalesce(excluded.garcom, zig_bonus.garcom), itens = coalesce(excluded.itens, zig_bonus.itens);
    n := n + 1; tot := tot + coalesce((it->>'consumo')::numeric, 0) + coalesce((it->>'taxa')::numeric, 0);
  end loop;
  insert into zig_bonus_coletas (noite, transacoes, total, coletado_em, erro) values (p_noite, n, tot, now(), null)
  on conflict (noite) do update set transacoes = excluded.transacoes, total = excluded.total, coletado_em = now(), erro = null;
  return jsonb_build_object('noite', p_noite, 'transacoes', n, 'total', tot);
end $$;
revoke execute on function public.fn_bonus_gravar_noite(date, jsonb) from public, anon, authenticated;
grant execute on function public.fn_bonus_gravar_noite(date, jsonb) to service_role;
update public.zig_bonus set itens = null where jsonb_typeof(itens) = 'null';

-- Resumo do mês: agora com o que já foi descontado e o que falta.
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
             coalesce(sum(b.consumo + b.taxa) filter (where b.noite between v_ini and v_fim and b.descontado_em is not null), 0) descontado,
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

-- Cartão da pessoa: meses (total, descontado, falta) e as transações de um mês, com produtos.
create or replace function public.fn_bonus_pessoa(p_id uuid, p_mes date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_ini date := date_trunc('month', p_mes)::date; v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
begin
  if not fn_bonus_pode() then raise exception 'Sem acesso.'; end if;
  return (select jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'tipo', p.tipo, 'permuta_tipo', p.permuta_tipo, 'permuta_valor', p.permuta_valor, 'permuta_inicio', p.permuta_inicio,
    'obs', p.obs, 'funcionario_cadastro', p.colaborador_id is not null, 'colaborador', (select c.nome_completo from colaboradores c where c.id = p.colaborador_id),
    'mes', v_ini,
    'meses', coalesce((select jsonb_agg(m order by m.mes desc) from (
       select date_trunc('month', b.noite)::date mes, sum(b.consumo + b.taxa) total,
              coalesce(sum(b.consumo + b.taxa) filter (where b.descontado_em is not null), 0) descontado, count(*) transacoes
       from zig_bonus b where b.pessoa_id = p.id group by 1) m), '[]'::jsonb),
    'transacoes', coalesce((select jsonb_agg(jsonb_build_object(
       'id', b.id, 'noite', b.noite, 'data', b.data, 'mesa', b.mesa, 'garcom', b.garcom, 'itens', b.itens, 'cartao', b.nome,
       'consumo', b.consumo, 'taxa', b.taxa, 'descontado_em', b.descontado_em, 'descontado_por', b.descontado_por) order by b.data, b.id)
       from zig_bonus b where b.pessoa_id = p.id and b.noite between v_ini and v_fim), '[]'::jsonb))
  from zig_bonus_pessoas p where p.id = p_id);
end $$;
revoke execute on function public.fn_bonus_pessoa(uuid, date) from public, anon;
grant execute on function public.fn_bonus_pessoa(uuid, date) to authenticated;

-- Marca (ou desmarca) transações como já descontadas.
create or replace function public.fn_bonus_descontar(p_ids bigint[], p_descontado boolean)
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not fn_bonus_pode() then raise exception 'Sem acesso.'; end if;
  update zig_bonus set
    descontado_em = case when p_descontado then coalesce(descontado_em, now()) end,
    descontado_por = case when p_descontado then coalesce(descontado_por, (select nome_completo from usuarios_sistema where id = fn_usuario_sistema_id())) end
  where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fn_bonus_descontar(bigint[], boolean) from public, anon;
grant execute on function public.fn_bonus_descontar(bigint[], boolean) to authenticated;

-- Para o RH da Central: total do mês, o que já foi descontado e o que falta.
drop function if exists public.fn_bonus_funcionarios_mes(date);
create function public.fn_bonus_funcionarios_mes(p_mes date)
returns table (nome text, colaborador text, total numeric, descontado numeric, falta numeric, noites bigint)
language sql stable security definer set search_path to 'public' as $$
  select p.nome, c.nome_completo, sum(b.consumo + b.taxa),
         coalesce(sum(b.consumo + b.taxa) filter (where b.descontado_em is not null), 0),
         coalesce(sum(b.consumo + b.taxa) filter (where b.descontado_em is null), 0),
         count(distinct b.noite)
  from zig_bonus b join zig_bonus_pessoas p on p.id = b.pessoa_id left join colaboradores c on c.id = p.colaborador_id
  where p.tipo = 'funcionario' and b.noite between date_trunc('month', p_mes)::date and (date_trunc('month', p_mes) + interval '1 month - 1 day')::date
  group by p.nome, c.nome_completo order by 3 desc
$$;
revoke execute on function public.fn_bonus_funcionarios_mes(date) from public, anon, authenticated;
