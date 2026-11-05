-- Extras: categoria "Extra" no cadastro de fornecedores e fim do nome livre ao lançar diária
-- (combinado com o Kadu em 05/11/2026, opção b: quem lança diária pode cadastrar pessoa nova,
-- mas com nome completo, chave PIX e aviso de nome parecido).

-- 1) Novo tipo de fornecedor: extra (diarista). Músico, RH/colaborador e geral continuam.
alter table public.fornecedores drop constraint if exists fornecedores_tipo_check;
alter table public.fornecedores add constraint fornecedores_tipo_check
  check (tipo = any (array['musico', 'rh', 'geral', 'extra']));

-- 2) Quem recebe quase só pagamento de extra (>= 80% das contas nas categorias de extras), ou está
--    ligado a uma pessoa do módulo, vira "extra". Colaborador da casa que faz extra continua como está.
with cat as (select unnest(array['2c6658df-ab7a-4398-9b0e-bc6af11556ee','e39e5a83-fe45-4f3e-a8a2-0a5806f73085',
  'f867b394-d8c5-4e59-aacf-e02f0078fbca','eff211e3-e096-40b8-8854-3b7d1ef888f7','ae5f2dff-2ea4-4b8f-a9e9-7bbe8e3f2906',
  '6f030239-f3df-4ecd-a5c6-2aaa3992669b']::uuid[]) id),
x as (
  select f.id, count(c.*) contas, count(c.*) filter (where c.categoria_id in (select id from cat)) ext,
         exists (select 1 from extras_pessoas p where p.fornecedor_id = f.id and p.juntado_com is null) pessoa,
         exists (select 1 from colaboradores co where co.status = 'ativo'
                 and greatest(similarity(lower(unaccent(co.nome_completo)), lower(unaccent(f.nome))),
                              word_similarity(lower(unaccent(f.nome)), lower(unaccent(co.nome_completo)))) >= 0.75) colab
  from fornecedores f left join contas_pagar c on c.fornecedor_id = f.id
  where f.tipo in ('geral', 'rh') group by f.id)
update fornecedores f set tipo = 'extra'
  from x where x.id = f.id and not x.colab and (x.pessoa or (x.ext > 0 and x.ext::numeric / greatest(x.contas, 1) >= 0.8));

-- 3) A diária ainda acha/cria o fornecedor quando a pessoa não tem (cadastros antigos), mas já como "extra".
create or replace function public.fn_extra_conta_pagar()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_forn uuid;
  v_cat uuid;
  v_nome text;
  v_desc text;
begin
  if not new.gera_conta or coalesce(new.valor_diaria, 0) <= 0 then return new; end if;

  if new.status_pagamento = 'cancelado' then
    if new.conta_pagar_id is not null then
      delete from contas_pagar where id = new.conta_pagar_id and coalesce(valor_pago, 0) = 0;
      if not found then return new; end if;
      new.conta_pagar_id := null;
    end if;
    return new;
  end if;

  if new.pessoa_id is not null then
    select fornecedor_id, nome into v_forn, v_nome from extras_pessoas where id = new.pessoa_id;
  end if;
  v_nome := coalesce(v_nome, new.nome);
  if v_forn is null then
    select id into v_forn from fornecedores
     where lower(unaccent(btrim(nome))) = lower(unaccent(btrim(v_nome))) and tipo in ('extra', 'rh') and status = 'ativo' limit 1;
    if v_forn is null then
      insert into fornecedores (nome, telefone, status, tipo, observacoes)
      values (v_nome, new.telefone, 'ativo', 'extra', 'Extra (diarista), cadastrado pelo modulo Extras')
      returning id into v_forn;
    end if;
    if new.pessoa_id is not null then update extras_pessoas set fornecedor_id = v_forn where id = new.pessoa_id; end if;
  end if;

  select categoria_financeira_id into v_cat from extras_tipos where id = new.tipo_id;
  v_cat := coalesce(v_cat, '6f030239-f3df-4ecd-a5c6-2aaa3992669b');
  v_desc := 'Extra: ' || v_nome || ' - ' || coalesce(new.funcao_temporaria, '') || ' - ' || to_char(new.data_trabalho, 'DD/MM/YYYY');

  if new.conta_pagar_id is null then
    insert into contas_pagar (fornecedor_id, descricao, categoria_id, valor_total, valor_original, valor_final, valor_pago,
                              data_vencimento, data_emissao, status, tipo_pagamento, origem_modulo, origem_id)
    values (v_forn, v_desc, v_cat, new.valor_diaria, new.valor_diaria, new.valor_diaria, 0,
            new.data_trabalho, current_date, 'em_aberto', 'unica', 'outros', new.id)
    returning id into new.conta_pagar_id;
  else
    update contas_pagar
       set fornecedor_id = v_forn, descricao = v_desc, categoria_id = v_cat,
           valor_total = new.valor_diaria, valor_original = new.valor_diaria, valor_final = new.valor_diaria,
           data_vencimento = new.data_trabalho, atualizado_em = now()
     where id = new.conta_pagar_id;
  end if;
  return new;
end $function$;

-- 4) Pessoa nova só por aqui: nome completo, PIX obrigatório, aviso de nome parecido,
--    e já ligada a quem recebe o PIX (o fornecedor de mesmo nome ou chave, senão um novo "extra").
create or replace function public.fn_extras_cadastrar_pessoa(
  p_nome text, p_pix text, p_telefone text default null, p_tipo_id uuid default null, p_outra_pessoa boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_nome text := initcap(lower(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'))));
  v_n text;
  v_pix text := nullif(btrim(coalesce(p_pix, '')), '');
  v_tel text := nullif(btrim(coalesce(p_telefone, '')), '');
  v_parecidos text;
  v_forn uuid;
  v_p extras_pessoas;
begin
  if auth.uid() is null then raise exception 'Faça login para cadastrar.'; end if;
  if array_length(array(select t from unnest(string_to_array(v_nome, ' ')) t where length(t) >= 2), 1) is null
     or array_length(array(select t from unnest(string_to_array(v_nome, ' ')) t where length(t) >= 2), 1) < 2 then
    raise exception 'Escreva o nome completo, como aparece no PIX (nome e sobrenome).';
  end if;
  if v_pix is null then raise exception 'A chave PIX é obrigatória.'; end if;
  v_n := lower(unaccent(v_nome));

  if exists (select 1 from extras_pessoas where juntado_com is null and lower(unaccent(btrim(nome))) = v_n) then
    raise exception 'Já existe "%" no cadastro. Escolha na lista.', v_nome;
  end if;
  if not p_outra_pessoa then
    select string_agg(nome, ', ' order by s desc) into v_parecidos from (
      select btrim(nome) nome, greatest(similarity(lower(unaccent(nome)), v_n), word_similarity(lower(unaccent(nome)), v_n)) s
        from extras_pessoas where juntado_com is null and ativo
       order by 2 desc limit 3) x where s >= 0.6;
    if v_parecidos is not null then
      raise exception 'PARECIDO: %', v_parecidos;
    end if;
  end if;

  -- quem recebe o PIX: mesma chave PIX, senão mesmo nome; não achou, cria como extra
  select id into v_forn from fornecedores where status = 'ativo' and chave_pix is not null and btrim(chave_pix) = v_pix limit 1;
  if v_forn is null then
    select id into v_forn from fornecedores where status = 'ativo' and lower(unaccent(btrim(nome))) = v_n limit 1;
  end if;
  if v_forn is null then
    insert into fornecedores (nome, telefone, chave_pix, status, tipo, observacoes)
    values (upper(v_nome), v_tel, v_pix, 'ativo', 'extra', 'Extra cadastrado no módulo de Extras')
    returning id into v_forn;
  else
    update fornecedores set chave_pix = coalesce(nullif(btrim(chave_pix), ''), v_pix),
                            telefone = coalesce(nullif(btrim(telefone), ''), v_tel)
     where id = v_forn;
  end if;

  insert into extras_pessoas (nome, telefone, pix, tipo_id, fornecedor_id)
  values (v_nome, v_tel, v_pix, p_tipo_id, v_forn)
  returning * into v_p;
  return to_jsonb(v_p);
end $function$;
revoke all on function public.fn_extras_cadastrar_pessoa(text, text, text, uuid, boolean) from public, anon;
grant execute on function public.fn_extras_cadastrar_pessoa(text, text, text, uuid, boolean) to authenticated;

-- 5) Toda diária nova precisa de pessoa cadastrada.
--    Fechar o insert direto em extras_pessoas (`revoke insert on public.extras_pessoas from anon, authenticated;`)
--    só DEPOIS que a tela nova estiver publicada: a tela antiga ainda cria pessoa por insert direto.
alter table public.extras_freelancers drop constraint if exists extras_pessoa_obrigatoria;
alter table public.extras_freelancers add constraint extras_pessoa_obrigatoria check (pessoa_id is not null) not valid;
