-- Fornecedores sem cadastro duplicado.
--
-- 1. Chave do nome (sem acento, minúsculo, sem pontuação e sem LTDA/ME/EIRELI/
--    EPP/S.A. no fim) e documento só com dígitos (CPF 11 / CNPJ 14).
-- 2. Trava: cadastrar ou renomear pelo sistema (telas, importações, funções
--    que gravam direto na tabela) um fornecedor ativo com a mesma chave ou o
--    mesmo CPF/CNPJ de outro ativo dá erro dizendo qual já existe. As rotinas
--    internas do banco (gorjeta, adiantamento, extras) seguem como antes: já
--    procuram pelo nome antes de criar. Duplicados antigos não são bloqueados
--    para editar outros campos.
-- 3. fn_fornecedor_encontrar: o cadastro igual (documento ou chave), para o
--    "procura ou cria" das telas não esbarrar na trava.
-- 4. fn_fornecedor_parecidos: nomes parecidos (ASSAI × ASSAI ATACADISTA) para
--    a tela avisar antes de criar.
-- 5. fn_fornecedor_unificar: junta um cadastro no outro (tudo que aponta para
--    o de origem passa para o destino; o de origem fica inativo, "(unificado
--    em …)"). Só pelo banco, sem acesso pela tela.

create or replace function public.fn_fornecedor_chave(p_nome text)
returns text language sql immutable parallel safe set search_path = public as $$
  select nullif(trim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, coalesce(p_nome, ''))), '[^a-z0-9]+', ' ', 'g'),
             '( (ltda|me|eireli|epp|s a|sa|mei))+ *$', '', 'g'),
           '\s+', ' ', 'g')), '')
$$;

create or replace function public.fn_fornecedor_doc(p_doc text)
returns text language sql immutable parallel safe as $$
  select case when length(d) in (11, 14) then d end
    from (select regexp_replace(coalesce(p_doc, ''), '\D', '', 'g') d) x
$$;

create index if not exists idx_fornecedores_chave on public.fornecedores (fn_fornecedor_chave(nome)) where status = 'ativo';
create index if not exists idx_fornecedores_doc on public.fornecedores (fn_fornecedor_doc(cnpj)) where status = 'ativo';

-- ── trava ────────────────────────────────────────────────────────────────────
create or replace function public.trg_fornecedor_sem_duplicar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_outro text; v_caminho text := coalesce(current_setting('request.path', true), '');
begin
  -- só o que vem do sistema gravando direto em fornecedores (telas, importações)
  if v_caminho <> '/fornecedores' then return new; end if;
  if coalesce(new.status, 'ativo') <> 'ativo' then return new; end if;
  if tg_op = 'UPDATE' and new.nome is not distinct from old.nome and new.cnpj is not distinct from old.cnpj
     and old.status is not distinct from new.status then
    return new;
  end if;

  if fn_fornecedor_doc(new.cnpj) is not null then
    select nome into v_outro from fornecedores
     where status = 'ativo' and id <> new.id and fn_fornecedor_doc(cnpj) = fn_fornecedor_doc(new.cnpj) limit 1;
    if v_outro is not null then
      raise exception 'Já existe o fornecedor "%" com este CPF/CNPJ. Use o cadastro existente.', trim(v_outro)
        using errcode = '23505', hint = 'fornecedor_duplicado';
    end if;
  end if;

  select nome into v_outro from fornecedores
   where status = 'ativo' and id <> new.id and fn_fornecedor_chave(nome) = fn_fornecedor_chave(new.nome) limit 1;
  if v_outro is not null then
    raise exception 'Já existe o fornecedor "%" com este nome. Use o cadastro existente.', trim(v_outro)
      using errcode = '23505', hint = 'fornecedor_duplicado';
  end if;
  return new;
end $$;

drop trigger if exists trg_fornecedor_sem_duplicar on public.fornecedores;
create trigger trg_fornecedor_sem_duplicar before insert or update of nome, cnpj, status on public.fornecedores
  for each row execute function trg_fornecedor_sem_duplicar();

-- ── o igual: mesmo documento, senão mesma chave ─────────────────────────────
create or replace function public.fn_fornecedor_encontrar(p_nome text, p_cnpj text default null)
returns uuid language sql stable security definer set search_path = public as $$
  select id from (
    select id, 1 o, criado_em from fornecedores
     where status = 'ativo' and fn_fornecedor_doc(p_cnpj) is not null and fn_fornecedor_doc(cnpj) = fn_fornecedor_doc(p_cnpj)
    union all
    select id, 2, criado_em from fornecedores
     where status = 'ativo' and fn_fornecedor_chave(p_nome) is not null and fn_fornecedor_chave(nome) = fn_fornecedor_chave(p_nome)
  ) x order by o, criado_em limit 1
$$;

-- ── os parecidos, para avisar antes de criar ────────────────────────────────
create or replace function public.fn_fornecedor_parecidos(p_nome text, p_cnpj text default null, p_ignorar uuid default null)
returns table (id uuid, nome text, cnpj text, motivo text, score numeric)
language sql stable security definer set search_path = public as $$
  with alvo as (select fn_fornecedor_chave(p_nome) k, fn_fornecedor_doc(p_cnpj) d),
  c as (
    select f.id, trim(f.nome) nome, f.cnpj, fn_fornecedor_chave(f.nome) k, fn_fornecedor_doc(f.cnpj) d
      from fornecedores f where f.status = 'ativo' and f.id is distinct from p_ignorar
  )
  select c.id, c.nome, c.cnpj,
         case when a.d is not null and c.d = a.d then 'mesmo CPF/CNPJ'
              when c.k = a.k then 'mesmo nome'
              when length(a.d) = 14 and length(c.d) = 14 and left(c.d, 8) = left(a.d, 8) then 'mesma empresa (outra filial)'
              when length(a.k) >= 4 and (c.k like a.k || ' %' or a.k like c.k || ' %') then 'nome contido'
              else 'nome parecido' end motivo,
         round(greatest(similarity(c.k, a.k),
               case when a.d is not null and c.d = a.d then 1 else 0 end)::numeric, 2) score
    from c, alvo a
   where a.k is not null
     and ((a.d is not null and c.d = a.d)
       or c.k = a.k
       or (length(a.d) = 14 and length(c.d) = 14 and left(c.d, 8) = left(a.d, 8))
       or (length(a.k) >= 4 and length(c.k) >= 4 and (c.k like a.k || ' %' or a.k like c.k || ' %'))
       or similarity(c.k, a.k) >= 0.55)
   order by score desc, c.nome
   limit 6
$$;

-- ── juntar dois cadastros ───────────────────────────────────────────────────
create or replace function public.fn_fornecedor_unificar(p_origem uuid, p_destino uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o fornecedores; d fornecedores; r record; n int; total jsonb := '{}'::jsonb;
begin
  if p_origem = p_destino then raise exception 'Origem e destino são o mesmo cadastro'; end if;
  select * into o from fornecedores where id = p_origem for update;
  select * into d from fornecedores where id = p_destino for update;
  if o.id is null or d.id is null then raise exception 'Fornecedor não encontrado'; end if;

  -- tudo que aponta para a origem passa para o destino
  for r in
    select c.conrelid::regclass tabela, a.attname coluna
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.fornecedores'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna) using p_destino, p_origem;
    get diagnostics n = row_count;
    if n > 0 then total := total || jsonb_build_object(r.tabela::text || '.' || r.coluna, n); end if;
  end loop;

  -- o destino herda o que não tinha
  update fornecedores set
    cnpj = coalesce(nullif(trim(cnpj), ''), o.cnpj),
    telefone = coalesce(nullif(trim(telefone), ''), o.telefone),
    email = coalesce(nullif(trim(email), ''), o.email),
    responsavel = coalesce(nullif(trim(responsavel), ''), o.responsavel),
    endereco = coalesce(nullif(trim(endereco), ''), o.endereco),
    categoria_padrao_id = coalesce(categoria_padrao_id, o.categoria_padrao_id),
    observacoes = concat_ws(' · ', nullif(trim(observacoes), ''), 'Unificado com "' || trim(o.nome) || '" em ' || to_char(current_date, 'DD/MM/YYYY'))
  where id = p_destino;

  update fornecedores set
    status = 'inativo',
    nome = trim(o.nome) || ' (unificado em ' || trim(d.nome) || ')',
    observacoes = concat_ws(' · ', nullif(trim(o.observacoes), ''), 'Unificado em "' || trim(d.nome) || '" em ' || to_char(current_date, 'DD/MM/YYYY'))
  where id = p_origem;

  return jsonb_build_object('origem', trim(o.nome), 'destino', trim(d.nome), 'movidos', total);
end $$;

revoke all on function public.fn_fornecedor_unificar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.trg_fornecedor_sem_duplicar() from public, anon, authenticated;
grant execute on function public.fn_fornecedor_encontrar(text, text) to authenticated;
grant execute on function public.fn_fornecedor_parecidos(text, text, uuid) to authenticated;
grant execute on function public.fn_fornecedor_chave(text) to authenticated;
grant execute on function public.fn_fornecedor_doc(text) to authenticated;
