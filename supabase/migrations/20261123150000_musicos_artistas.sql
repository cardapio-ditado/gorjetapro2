-- Aba "Artistas" no módulo de Músicos (Kadu, 23/11/2026): o cadastro dos artistas dentro do próprio
-- módulo, sem precisar abrir um show. Só gerente (admin/master) cadastra e edita, como já era a regra.
--
-- Artista = fornecedor do tipo 'musico'. Trocar o nome do artista também troca o nome dos shows dele
-- ("Projeto · Artista" mantém o projeto). O gatilho do show regrava a conta a pagar pelo show
-- (descrição e vencimento): aqui o vencimento de cada conta é guardado antes e devolvido depois,
-- e a função aborta se o total, o pago ou a quantidade de contas mudar.

create or replace function public.fn_musicos_pode(p_editar boolean default false)
returns table (uid uuid, nome text)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select u.id, u.nome_completo from usuarios_sistema u
   where u.id = fn_usuario_sistema_id() and u.ativo
     and (u.nivel in ('master', 'admin') or (not p_editar and exists (
       select 1 from permissoes_usuario pu join modulos_sistema m on m.id = pu.modulo_id
        where pu.usuario_id = u.id and m.slug = 'musicos' and pu.aba_id is null and pu.pode_visualizar)));
  if not found then
    raise exception '%', case when p_editar then 'só gerente cadastra e edita artista' else 'sem acesso' end;
  end if;
end $$;

-- A lista da aba: cada artista com os shows e o que falta pagar (controle do módulo).
create or replace function public.fn_musicos_artistas()
returns table (id uuid, nome text, chave_pix text, telefone text, ativo boolean, shows integer, ultimo date, proximo date,
               aberto numeric, shows_abertos integer, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform fn_musicos_pode(false);
  return query
  select f.id, btrim(f.nome), nullif(btrim(coalesce(f.chave_pix, '')), ''), nullif(btrim(coalesce(f.telefone, '')), ''),
         f.status = 'ativo',
         count(m.id) filter (where m.status_pagamento <> 'cancelado')::integer,
         max(m.data_evento::date) filter (where m.status_pagamento <> 'cancelado' and m.data_evento::date <= (now() at time zone 'America/Cuiaba')::date),
         min(m.data_evento::date) filter (where m.status_pagamento <> 'cancelado' and m.data_evento::date > (now() at time zone 'America/Cuiaba')::date),
         coalesce(sum(greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0))
           filter (where m.status_pagamento not in ('pago', 'cancelado') and m.data_evento::date >= date '2026-10-01'), 0),
         (count(*) filter (where m.status_pagamento not in ('pago', 'cancelado') and m.data_evento::date >= date '2026-10-01'
                             and greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0) > 0))::integer,
         f.criado_em::timestamptz
    from fornecedores f
    left join musicos m on m.fornecedor_id = f.id
   where f.tipo = 'musico'
   group by f.id;
end $$;

-- Cadastrar (p_id nulo) ou editar um artista. Nome como está no Pix; chave Pix obrigatória.
-- Nome parecido com outro artista: só passa com p_outro = true ("é outro artista").
create or replace function public.fn_musicos_artista_salvar(p_id uuid, p_nome text, p_pix text, p_telefone text default null,
  p_outro boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q record; f fornecedores%rowtype; v_nome text; v_pix text; v_tel text; v_parecido text; v_id uuid;
  v_antes record; v_depois record; v_shows integer := 0; v_venc jsonb;
begin
  select * into q from fn_musicos_pode(true);
  v_nome := upper(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')));
  v_pix := btrim(coalesce(p_pix, ''));
  v_tel := nullif(btrim(coalesce(p_telefone, '')), '');
  if length(v_nome) < 3 then raise exception 'escreva o nome do artista como está no Pix'; end if;
  if v_pix = '' then raise exception 'a chave Pix é obrigatória'; end if;

  if p_id is not null then
    select * into f from fornecedores where id = p_id and tipo = 'musico' for update;
    if f.id is null then raise exception 'artista não encontrado'; end if;
  end if;

  -- mesmo nome: nunca; nome parecido: só confirmando que é outro artista
  if exists (select 1 from fornecedores x where x.status = 'ativo' and x.id is distinct from p_id
              and fn_fornecedor_chave(x.nome) = fn_fornecedor_chave(v_nome)) then
    raise exception 'já existe um cadastro com esse nome: escolha o existente';
  end if;
  if not coalesce(p_outro, false) then
    select btrim(x.nome) into v_parecido from fornecedores x
     where x.tipo = 'musico' and x.status = 'ativo' and x.id is distinct from p_id
       and greatest(similarity(lower(unaccent(x.nome)), lower(unaccent(v_nome))), word_similarity(lower(unaccent(v_nome)), lower(unaccent(x.nome)))) >= 0.75
     order by similarity(lower(unaccent(x.nome)), lower(unaccent(v_nome))) desc limit 1;
    if v_parecido is not null then
      raise exception 'nome parecido com o artista "%". Se for outro artista, marque "É outro artista"', v_parecido;
    end if;
  end if;

  if p_id is null then
    insert into fornecedores (nome, chave_pix, telefone, status, tipo, observacoes)
    values (v_nome, v_pix, v_tel, 'ativo', 'musico', 'Artista cadastrado no módulo de Músicos por ' || q.nome)
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'nome', v_nome, 'novo', true);
  end if;

  update fornecedores set chave_pix = v_pix, telefone = v_tel, nome = v_nome, atualizado_em = now() where id = p_id;

  -- nome mudou: os shows passam a ter o nome novo. O gatilho do show regrava a conta (valor, vencimento,
  -- status): tudo isso é guardado antes e devolvido depois; só a descrição da conta muda.
  if btrim(f.nome) is distinct from v_nome then
    select coalesce(sum(c.valor_total), 0) t, coalesce(sum(c.valor_pago), 0) p, count(*) n into v_antes
      from contas_pagar c where c.origem_modulo = 'musicos' and c.origem_id in (select m.id from musicos m where m.fornecedor_id = p_id);
    select coalesce(jsonb_object_agg(c.id, jsonb_build_object('venc', c.data_vencimento, 'vt', c.valor_total, 'vo', c.valor_original,
             'vf', c.valor_final, 'st', c.status)), '{}'::jsonb) into v_venc from contas_pagar c
     where c.origem_modulo = 'musicos' and c.origem_id in (select m.id from musicos m where m.fornecedor_id = p_id);

    update musicos m
       set nome = case when m.nome like '%·%' then btrim(split_part(m.nome, '·', 1)) || ' · ' || v_nome else v_nome end
     where m.fornecedor_id = p_id
       and btrim(m.nome) is distinct from (case when m.nome like '%·%' then btrim(split_part(m.nome, '·', 1)) || ' · ' || v_nome else v_nome end);
    get diagnostics v_shows = row_count;

    update contas_pagar c
       set data_vencimento = (v.value->>'venc')::date, valor_total = (v.value->>'vt')::numeric,
           valor_original = (v.value->>'vo')::numeric, valor_final = (v.value->>'vf')::numeric, status = v.value->>'st'
      from jsonb_each(v_venc) v
     where c.id = (v.key)::uuid
       and (c.data_vencimento, c.valor_total, c.valor_original, c.valor_final, c.status)
           is distinct from ((v.value->>'venc')::date, (v.value->>'vt')::numeric, (v.value->>'vo')::numeric, (v.value->>'vf')::numeric, v.value->>'st');

    select coalesce(sum(c.valor_total), 0) t, coalesce(sum(c.valor_pago), 0) p, count(*) n into v_depois
      from contas_pagar c where c.origem_modulo = 'musicos' and c.origem_id in (select m.id from musicos m where m.fornecedor_id = p_id);
    if v_antes.t <> v_depois.t or v_antes.p <> v_depois.p or v_antes.n <> v_depois.n then
      raise exception 'a troca de nome mexeria nos valores das contas: nada foi alterado';
    end if;
  end if;
  return jsonb_build_object('id', p_id, 'nome', v_nome, 'novo', false, 'shows_renomeados', v_shows);
end $$;

-- Inativar (sai da lista de escolha do show) ou reativar. Não inativa quem tem show a pagar ou show marcado.
create or replace function public.fn_musicos_artista_ativo(p_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare q record;
begin
  select * into q from fn_musicos_pode(true);
  if not exists (select 1 from fornecedores where id = p_id and tipo = 'musico') then raise exception 'artista não encontrado'; end if;
  if not p_ativo and exists (
    select 1 from musicos m where m.fornecedor_id = p_id and m.status_pagamento not in ('pago', 'cancelado')
       and (m.data_evento::date > (now() at time zone 'America/Cuiaba')::date
            or greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0) > 0)) then
    raise exception 'esse artista tem show a pagar ou show marcado: não dá para inativar';
  end if;
  update fornecedores set status = case when p_ativo then 'ativo' else 'inativo' end, atualizado_em = now() where id = p_id;
end $$;

revoke all on function public.fn_musicos_pode(boolean) from public, anon, authenticated;
revoke all on function public.fn_musicos_artistas(), public.fn_musicos_artista_salvar(uuid, text, text, text, boolean),
  public.fn_musicos_artista_ativo(uuid, boolean) from public, anon;
grant execute on function public.fn_musicos_artistas(), public.fn_musicos_artista_salvar(uuid, text, text, text, boolean),
  public.fn_musicos_artista_ativo(uuid, boolean) to authenticated;
