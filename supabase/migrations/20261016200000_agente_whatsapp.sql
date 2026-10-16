-- Agente de estoque pelo WhatsApp.
--
-- A equipe conversa com um número de WhatsApp só do agente. Uma ponte na VPS
-- entrega cada mensagem à função de borda agente-whatsapp, que identifica a
-- pessoa pelo telefone, confere o que o papel dela permite e só então chama as
-- mesmas funções do Estoque Beta 2 (entrada de nota, transferência).
--
-- A trava de permissão mora aqui, no banco (fn_agente_executar), e não no
-- prompt: o agente não consegue "ser convencido" a fazer o que o papel não
-- permite.
--
-- Tudo é acessado só pelo service_role (a função de borda). RLS ligado e sem
-- políticas: o app e a chave anônima não leem nem escrevem nessas tabelas.

-- ─── Papéis e permissões ───────────────────────────────────────────────────

create table public.agente_papeis (
  papel text primary key,
  nome text not null,
  descricao text
);

create table public.agente_permissoes (
  papel text not null references public.agente_papeis(papel) on delete cascade,
  acao text not null,
  modo text not null default 'direto' check (modo in ('direto', 'pendente')),
  estoques uuid[],
  primary key (papel, acao)
);

comment on column public.agente_permissoes.modo is
  'direto = executa na hora. pendente = vira pedido de aprovação para quem tem a ação aprovar.';
comment on column public.agente_permissoes.estoques is
  'Estoques em que a ação vale. Nulo = todos. Na transferência, origem e destino precisam estar na lista.';

-- ─── Equipe ────────────────────────────────────────────────────────────────

create table public.agente_equipe (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text unique,
  papel text not null references public.agente_papeis(papel),
  usuario_id uuid references public.usuarios_sistema(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on column public.agente_equipe.telefone is
  'Só dígitos, com 55 e DDD. A comparação usa DDD + 8 últimos dígitos, porque o WhatsApp às vezes omite o nono dígito.';
comment on column public.agente_equipe.usuario_id is
  'Usuário do sistema em nome de quem as ações são gravadas. Sem usuário, grava pelo usuario_padrao de agente_config e anota o nome na observação.';

-- ─── Conversa (entrada e saída) ────────────────────────────────────────────

create table public.agente_mensagens (
  id bigint generated always as identity primary key,
  equipe_id uuid references public.agente_equipe(id),
  telefone text,
  jid text,
  direcao text not null check (direcao in ('entrada', 'saida')),
  tipo text not null default 'texto' check (tipo in ('texto', 'imagem', 'audio', 'documento')),
  texto text,
  midia_path text,
  wa_id text unique,
  status text not null check (status in (
    'nova', 'processando', 'respondida', 'ignorada', 'erro',
    'pendente_envio', 'enviada', 'falha_envio', 'simulada')),
  erro text,
  uso jsonb,
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);

comment on column public.agente_mensagens.jid is
  'Endereço do WhatsApp de onde a mensagem veio (pode ser @lid). A resposta volta para ele.';

create index agente_mensagens_fila on public.agente_mensagens (direcao, status, id);
create index agente_mensagens_pessoa on public.agente_mensagens (equipe_id, criado_em desc);

-- Rascunho: o agente monta a nota (ou transferência), mostra o resumo e só
-- lança quando a pessoa confirma. O rascunho guarda as linhas entre as duas
-- mensagens.
create table public.agente_rascunhos (
  id bigint generated always as identity primary key,
  equipe_id uuid not null references public.agente_equipe(id),
  acao text not null,
  args jsonb not null,
  resumo text,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table public.agente_pendencias (
  id bigint generated always as identity primary key,
  solicitante_id uuid not null references public.agente_equipe(id),
  acao text not null,
  args jsonb not null,
  resumo text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada', 'cancelada', 'erro')),
  decidido_por uuid references public.agente_equipe(id),
  decidido_em timestamptz,
  motivo text,
  resultado jsonb,
  criado_em timestamptz not null default now()
);

create table public.agente_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.agente_papeis enable row level security;
alter table public.agente_permissoes enable row level security;
alter table public.agente_equipe enable row level security;
alter table public.agente_mensagens enable row level security;
alter table public.agente_rascunhos enable row level security;
alter table public.agente_pendencias enable row level security;
alter table public.agente_config enable row level security;

revoke all on public.agente_papeis, public.agente_permissoes, public.agente_equipe,
  public.agente_mensagens, public.agente_rascunhos, public.agente_pendencias,
  public.agente_config from anon, authenticated;

-- ─── Dados iniciais ────────────────────────────────────────────────────────

insert into public.agente_papeis (papel, nome, descricao) values
  ('dono', 'Dono', 'Tudo.'),
  ('gerente_geral', 'Gerente geral', 'Lança nota, transfere, aprova pendências, vê compras.'),
  ('gerente_noite', 'Gerente da noite', 'Transfere e consulta. Nota fica pendente.'),
  ('chefe_bar', 'Chefe de bar', 'Bar e Central. Nota fica pendente.'),
  ('chefe_cozinha', 'Chefe de cozinha', 'Cozinha e Central. Nota fica pendente.'),
  ('estoquista', 'Estoquista', 'Lança nota, transfere, aprova pendências, vê compras.'),
  ('nutricionista', 'Nutricionista', 'Consulta estoque e fichas.'),
  ('comprador', 'Comprador externo', 'Manda foto da nota (fica pendente) e vê a lista de compras.');

-- Central ea043464, Bar 10b3aacf, Cozinha 1da77d06.
insert into public.agente_permissoes (papel, acao, modo, estoques) values
  ('dono', 'consultar', 'direto', null),
  ('dono', 'lancar_nota', 'direto', null),
  ('dono', 'transferir', 'direto', null),
  ('dono', 'aprovar', 'direto', null),
  ('dono', 'compras', 'direto', null),

  ('gerente_geral', 'consultar', 'direto', null),
  ('gerente_geral', 'lancar_nota', 'direto', null),
  ('gerente_geral', 'transferir', 'direto', null),
  ('gerente_geral', 'aprovar', 'direto', null),
  ('gerente_geral', 'compras', 'direto', null),

  ('gerente_noite', 'consultar', 'direto', null),
  ('gerente_noite', 'lancar_nota', 'pendente', null),
  ('gerente_noite', 'transferir', 'direto', null),

  ('chefe_bar', 'consultar', 'direto',
    array['10b3aacf-61b1-4add-91ac-0949d3e7f3a3', 'ea043464-d54e-4f42-8e40-4edddc5b4b51']::uuid[]),
  ('chefe_bar', 'lancar_nota', 'pendente', null),
  ('chefe_bar', 'transferir', 'direto',
    array['10b3aacf-61b1-4add-91ac-0949d3e7f3a3', 'ea043464-d54e-4f42-8e40-4edddc5b4b51']::uuid[]),

  ('chefe_cozinha', 'consultar', 'direto',
    array['1da77d06-f428-49b4-afa7-9ffaa90b8557', 'ea043464-d54e-4f42-8e40-4edddc5b4b51']::uuid[]),
  ('chefe_cozinha', 'lancar_nota', 'pendente', null),
  ('chefe_cozinha', 'transferir', 'direto',
    array['1da77d06-f428-49b4-afa7-9ffaa90b8557', 'ea043464-d54e-4f42-8e40-4edddc5b4b51']::uuid[]),

  ('estoquista', 'consultar', 'direto', null),
  ('estoquista', 'lancar_nota', 'direto', null),
  ('estoquista', 'transferir', 'direto', null),
  ('estoquista', 'aprovar', 'direto', null),
  ('estoquista', 'compras', 'direto', null),

  ('nutricionista', 'consultar', 'direto', null),

  ('comprador', 'consultar', 'direto', array['ea043464-d54e-4f42-8e40-4edddc5b4b51']::uuid[]),
  ('comprador', 'lancar_nota', 'pendente', null),
  ('comprador', 'compras', 'direto', null);

-- Telefones: os que já estão no cadastro de usuários entram aqui. Os demais
-- ficam vazios até serem informados (sem telefone a pessoa não é reconhecida).
insert into public.agente_equipe (nome, papel, usuario_id, telefone)
select v.nome, v.papel, u.id, nullif(regexp_replace(coalesce(u.telefone, ''), '\D', '', 'g'), '')
  from (values
    ('Kadu', 'dono', 'Kadu Mendes'),
    ('Cristiano', 'gerente_geral', 'Cristiano'),
    ('Carol', 'estoquista', 'Carol'),
    ('Evelyn', 'nutricionista', 'Evelyn')
  ) v(nome, papel, usuario)
  left join public.usuarios_sistema u on u.nome_completo = v.usuario and u.ativo;

insert into public.agente_equipe (nome, papel) values
  ('Gilberto', 'gerente_noite'),
  ('Henrian', 'chefe_bar'),
  ('João Vitor', 'chefe_cozinha'),
  ('Jonathan', 'comprador');

-- Normaliza para 55 + DDD + número.
update public.agente_equipe
   set telefone = '55' || telefone
 where telefone is not null and length(telefone) in (10, 11);

insert into public.agente_config (chave, valor) values
  ('modo_ensaio', 'true'),
  ('so_dono', 'true'),
  ('modelo', '"claude-opus-5-5"'),
  ('esforco', '"medium"'),
  ('usuario_padrao', to_jsonb('fc0f2a96-5379-48a4-b525-ec41ed9b25fd'::text));

comment on table public.agente_config is
  'modo_ensaio: true = o agente responde mas não grava nada. so_dono: true = só o papel dono é atendido (fase de teste). regras_da_casa: texto que entra no prompt do agente.';

-- ─── Funções auxiliares ────────────────────────────────────────────────────

-- DDD + 8 últimos dígitos. Casa números com e sem o nono dígito e com ou sem 55.
create or replace function public.fn_agente_tel_chave(p_telefone text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if length(d) >= 12 and left(d, 2) = '55' then d := substr(d, 3); end if;
  if length(d) < 10 then return null; end if;
  return left(d, 2) || right(d, 8);
end $$;

create or replace function public.fn_agente_norm(p_texto text)
returns text language sql stable as $$
  select lower(public.unaccent(coalesce(p_texto, '')))
$$;

create or replace function public.fn_agente_cfg(p_chave text)
returns jsonb language sql stable security definer set search_path = public as $$
  select valor from agente_config where chave = p_chave
$$;

-- Quem está falando: pessoa, papel e permissões (com o nome dos estoques).
create or replace function public.fn_agente_quem(p_telefone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'id', e.id, 'nome', e.nome, 'papel', e.papel, 'papel_nome', p.nome,
           'permissoes', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'acao', pe.acao, 'modo', pe.modo,
                      'estoques', (select jsonb_agg(es.nome order by es.nome)
                                     from estoques es where es.id = any (pe.estoques))))
               from agente_permissoes pe where pe.papel = e.papel), '[]'::jsonb))
    from agente_equipe e
    join agente_papeis p on p.papel = e.papel
   where e.ativo and e.telefone is not null
     and fn_agente_tel_chave(e.telefone) = fn_agente_tel_chave(p_telefone)
   limit 1
$$;

create or replace function public.fn_agente_estoques_permitidos(p_equipe uuid, p_acao text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(pe.estoques, (select array_agg(id) from estoques where status))
    from agente_equipe e join agente_permissoes pe on pe.papel = e.papel and pe.acao = p_acao
   where e.id = p_equipe and e.ativo
$$;

-- ─── Consultas (ferramentas de leitura) ────────────────────────────────────

-- Busca de item por palavras (todas precisam aparecer) ou nome parecido.
-- Traz o saldo só dos estoques que a pessoa pode consultar e a última compra,
-- que ajuda a casar a linha da nota com o item certo.
create or replace function public.fn_agente_buscar_itens(p_equipe uuid, p_texto text, p_limite int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_norm text := fn_agente_norm(trim(p_texto));
  v_palavras text[] := regexp_split_to_array(fn_agente_norm(trim(p_texto)), '\s+');
  v_estoques uuid[] := fn_agente_estoques_permitidos(p_equipe, 'consultar');
  v_res jsonb;
begin
  if v_estoques is null then
    v_estoques := (select array['ea043464-d54e-4f42-8e40-4edddc5b4b51'::uuid]);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) - 'ordem' - 'sim' order by x.ordem, x.sim desc), '[]'::jsonb) into v_res from (
    select i.id, i.nome, i.unidade_medida as unidade, i.categoria,
           round(coalesce(i.custo_medio, 0), 2) as custo_medio,
           (select jsonb_object_agg(es.nome, round(coalesce(s.quantidade_atual, 0), 3))
              from estoques es
              left join saldos_estoque s on s.item_id = i.id and s.estoque_id = es.id
             where es.id = any (v_estoques)) as saldos,
           (select jsonb_build_object('data', e.data_compra, 'fornecedor', f.nome,
                                      'qtd', round(ic.quantidade_recebida, 3),
                                      'custo', round(ic.custo_unitario, 4))
              from itens_entrada_compra ic
              join entradas_compras e on e.id = ic.entrada_compra_id
              left join fornecedores f on f.id = e.fornecedor_id
             where ic.item_id = i.id
             order by e.data_compra desc, e.criado_em desc limit 1) as ultima_compra,
           case when (select bool_and(fn_agente_norm(i.nome) like '%' || w || '%') from unnest(v_palavras) w)
                then 0 else 1 end as ordem,
           similarity(fn_agente_norm(i.nome), v_norm) as sim
      from itens_estoque i
     where i.status = 'ativo'
       and ((select bool_and(fn_agente_norm(i.nome) like '%' || w || '%') from unnest(v_palavras) w)
            or similarity(fn_agente_norm(i.nome), v_norm) > 0.3)
     order by ordem, sim desc
     limit greatest(1, least(coalesce(p_limite, 8), 20))
  ) x;
  return v_res;
end $$;

create or replace function public.fn_agente_buscar_fornecedor(p_texto text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_dig text := regexp_replace(coalesce(p_texto, ''), '\D', '', 'g');
  v_norm text := fn_agente_norm(trim(p_texto));
  v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res from (
    select f.id, f.nome, f.cnpj,
           (select max(e.data_compra) from entradas_compras e where e.fornecedor_id = f.id) as ultima_compra
      from fornecedores f
     where (length(v_dig) >= 8 and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') like v_dig || '%')
        or fn_agente_norm(f.nome) like '%' || v_norm || '%'
        or similarity(fn_agente_norm(f.nome), v_norm) > 0.3
     order by (length(v_dig) >= 8 and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') like v_dig || '%') desc,
              similarity(fn_agente_norm(f.nome), v_norm) desc
     limit 6
  ) x;
  return v_res;
end $$;

-- Linha do tempo de um item: compras, transferências, vendas, contagens.
create or replace function public.fn_agente_movimentos(p_equipe uuid, p_item uuid, p_dias int default 3)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'dia', to_char(m.data_movimentacao, 'DD/MM'),
           'lancado', to_char(m.criado_em at time zone 'America/Cuiaba', 'DD/MM HH24:MI'),
           'tipo', m.tipo_movimentacao, 'de', e1.nome, 'para', e2.nome,
           'qtd', round(m.quantidade, 3), 'motivo', m.motivo,
           'obs', left(m.observacoes, 90)) order by m.data_movimentacao, m.criado_em), '[]'::jsonb)
    from movimentacoes_estoque m
    left join estoques e1 on e1.id = m.estoque_origem_id
    left join estoques e2 on e2.id = m.estoque_destino_id
   where m.item_id = p_item
     and m.data_movimentacao >= fn_hoje_cuiaba() - greatest(1, least(coalesce(p_dias, 3), 15))
     and (m.estoque_origem_id = any (fn_agente_estoques_permitidos(p_equipe, 'consultar'))
          or m.estoque_destino_id = any (fn_agente_estoques_permitidos(p_equipe, 'consultar')))
$$;

-- Vendas da Zig de um dia (as que a baixa automática já buscou).
create or replace function public.fn_agente_vendas_zig(p_data date, p_texto text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('produto', z.zig_product_name, 'qtd', z.q) order by z.q desc), '[]'::jsonb)
    from (select zig_product_name, sum(quantidade) q
            from zig_vendas_sync_ids
           where data_venda = p_data
             and (p_texto is null or fn_agente_norm(zig_product_name) like '%' || fn_agente_norm(p_texto) || '%')
           group by 1) z
$$;

create or replace function public.fn_agente_notas_recentes(p_dias int default 3)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'fornecedor', f.nome, 'numero', e.numero_documento,
           'data', e.data_compra, 'valor', e.valor_total,
           'lancada', to_char(e.criado_em at time zone 'America/Cuiaba', 'DD/MM HH24:MI'),
           'itens', (select count(*) from itens_entrada_compra ic where ic.entrada_compra_id = e.id))
           order by e.criado_em desc), '[]'::jsonb)
    from entradas_compras e left join fornecedores f on f.id = e.fornecedor_id
   where e.criado_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 3), 15)))
$$;

create or replace function public.fn_agente_lista_compras()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'item', r.nome, 'unidade', r.unidade_medida, 'situacao', r.situacao,
           'saldo_central', r.saldo_central, 'ponto', r.ponto_pedido,
           'comprar', r.quantidade_sugerida, 'fornecedor', r.fornecedor_nome)
           order by r.situacao, r.nome), '[]'::jsonb)
    from fn_reposicao_central(90, 2) r
   where r.situacao in ('zerado', 'comprar')
     and r.quantidade_sugerida > 0
$$;

create or replace function public.fn_agente_pendencias_abertas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'acao', p.acao, 'resumo', p.resumo, 'de', e.nome,
           'criado', to_char(p.criado_em at time zone 'America/Cuiaba', 'DD/MM HH24:MI'))
           order by p.id), '[]'::jsonb)
    from agente_pendencias p join agente_equipe e on e.id = p.solicitante_id
   where p.status = 'pendente'
$$;

create or replace function public.fn_agente_rascunho_salvar(p_equipe uuid, p_acao text, p_args jsonb, p_resumo text)
returns bigint language sql security definer set search_path = public as $$
  insert into agente_rascunhos (equipe_id, acao, args, resumo)
  values (p_equipe, p_acao, p_args, p_resumo)
  returning id
$$;

-- ─── Execução (escrita) ────────────────────────────────────────────────────

-- Confere se a ação cabe nos estoques do papel.
create or replace function public.fn_agente_escopo_ok(p_estoques uuid[], p_acao text, p_args jsonb)
returns boolean language plpgsql immutable as $$
begin
  if p_estoques is null then return true; end if;
  if p_acao = 'transferir' then
    return (p_args->>'de')::uuid = any (p_estoques) and (p_args->>'para')::uuid = any (p_estoques);
  end if;
  return true;
end $$;

-- Executa a ação em nome de uma pessoa. Não confere permissão: quem chama é
-- fn_agente_executar ou fn_agente_decidir, que já conferiram.
create or replace function public.fn_agente_acao(p_pessoa uuid, p_acao text, p_args jsonb, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_e agente_equipe;
  v_usuario uuid;
  v_auth uuid;
  v_assin text;
  v_res jsonb;
  v_dup uuid;
  v_total numeric;
  v_motivo text;
  v_data date;
begin
  select * into v_e from agente_equipe where id = p_pessoa;
  v_usuario := coalesce(v_e.usuario_id, (fn_agente_cfg('usuario_padrao') #>> '{}')::uuid);
  select coalesce(auth_user_id, id) into v_auth from usuarios_sistema where id = v_usuario;
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_auth)::text, true);
  v_assin := 'via WhatsApp por ' || v_e.nome || coalesce(', ' || p_nota, '');

  if p_acao = 'lancar_nota' then
    if coalesce(p_args->>'fornecedor_id', '') = '' then raise exception 'Nota sem fornecedor'; end if;
    if jsonb_array_length(coalesce(p_args->'itens', '[]'::jsonb)) = 0 then raise exception 'Nota sem itens'; end if;
    select sum((x->>'quantidade')::numeric * (x->>'custo_unitario')::numeric) into v_total
      from jsonb_array_elements(p_args->'itens') x;

    if coalesce(p_args->>'numero_documento', '') <> '' then
      select id into v_dup from entradas_compras
       where fornecedor_id = (p_args->>'fornecedor_id')::uuid
         and numero_documento = p_args->>'numero_documento' limit 1;
    end if;
    if v_dup is null and not coalesce((p_args->>'forcar')::boolean, false) then
      select id into v_dup from entradas_compras
       where fornecedor_id = (p_args->>'fornecedor_id')::uuid
         and data_compra = (p_args->>'data_compra')::date
         and abs(valor_total - v_total) < 0.05 limit 1;
    end if;
    if v_dup is not null then
      return jsonb_build_object('duplicada', true, 'entrada_id', v_dup);
    end if;

    v_res := fn_recebimento_confirmar(jsonb_build_object(
      'entrada_id', null,
      'fornecedor_id', p_args->>'fornecedor_id',
      'numero_documento', coalesce(p_args->>'numero_documento', ''),
      'data_compra', coalesce(p_args->>'data_compra', fn_hoje_cuiaba()::text),
      'condicao_pagamento', 'a_vista',
      'arquivo', null,
      'observacoes', concat_ws(' · ', nullif(p_args->>'observacoes', ''), v_assin),
      'itens', (select jsonb_agg(jsonb_build_object(
                   'linha_id', null, 'item_id', x->>'item_id',
                   'quantidade_recebida', (x->>'quantidade')::numeric,
                   'custo_unitario', (x->>'custo_unitario')::numeric,
                   'data_validade', null))
                  from jsonb_array_elements(p_args->'itens') x)));
    return v_res;

  elsif p_acao = 'transferir' then
    v_data := coalesce((p_args->>'data')::date, fn_hoje_cuiaba());
    if v_data > fn_hoje_cuiaba() or v_data < fn_hoje_cuiaba() - 3 then
      raise exception 'Data da transferência fora do permitido (até 3 dias atrás)';
    end if;
    v_motivo := concat_ws(' · ', coalesce(nullif(p_args->>'motivo', ''), 'Transferência'), v_assin);
    v_res := fn_mover_estoques(jsonb_build_object(
      'de', p_args->>'de', 'para', p_args->>'para',
      'responsavel', v_e.nome, 'motivo', v_motivo,
      'itens', (select jsonb_agg(jsonb_build_object('item_id', x->>'item_id', 'quantidade', (x->>'quantidade')::numeric))
                  from jsonb_array_elements(p_args->'itens') x)));
    if v_data < fn_hoje_cuiaba() then
      update movimentacoes_estoque set data_movimentacao = v_data
       where tipo_movimentacao = 'transferencia' and motivo = v_motivo and criado_em >= now() - interval '1 minute';
    end if;
    return v_res || jsonb_build_object('data', v_data);
  end if;

  raise exception 'Ação desconhecida: %', p_acao;
end $$;

-- Porta de entrada de toda escrita do agente. Confere pessoa, permissão e
-- escopo. Ação "pendente" vira pedido de aprovação. Em modo ensaio, devolve o
-- que faria sem gravar.
create or replace function public.fn_agente_executar(p_pessoa uuid, p_acao text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_e agente_equipe;
  v_p agente_permissoes;
  v_args jsonb := p_args;
  v_rasc agente_rascunhos;
  v_resumo text := p_args->>'resumo';
  v_id bigint;
  v_res jsonb;
begin
  select * into v_e from agente_equipe where id = p_pessoa and ativo;
  if not found then raise exception 'Pessoa não cadastrada ou inativa'; end if;

  if p_args ? 'rascunho_id' then
    select * into v_rasc from agente_rascunhos
     where id = (p_args->>'rascunho_id')::bigint and equipe_id = p_pessoa and acao = p_acao;
    if not found then
      return jsonb_build_object('status', 'erro', 'motivo', 'Rascunho não encontrado para esta pessoa.');
    end if;
    if v_rasc.usado_em is not null then
      return jsonb_build_object('status', 'erro', 'motivo', 'Este rascunho já foi usado.');
    end if;
    v_args := v_rasc.args || (p_args - 'rascunho_id');
    v_resumo := coalesce(v_rasc.resumo, v_resumo);
  end if;

  select * into v_p from agente_permissoes where papel = v_e.papel and acao = p_acao;
  if not found then
    return jsonb_build_object('status', 'negado', 'motivo', 'O seu papel não permite esta ação.');
  end if;
  if not fn_agente_escopo_ok(v_p.estoques, p_acao, v_args) then
    return jsonb_build_object('status', 'negado', 'motivo', 'Essa transferência envolve um estoque fora do seu setor.');
  end if;

  if v_p.modo = 'pendente' then
    insert into agente_pendencias (solicitante_id, acao, args, resumo)
    values (p_pessoa, p_acao, v_args, coalesce(v_resumo, p_acao))
    returning id into v_id;
    if v_rasc.id is not null then update agente_rascunhos set usado_em = now() where id = v_rasc.id; end if;
    return jsonb_build_object('status', 'pendente', 'pendencia_id', v_id);
  end if;

  if coalesce((fn_agente_cfg('modo_ensaio') #>> '{}')::boolean, true) then
    return jsonb_build_object('status', 'ensaio', 'acao', p_acao, 'args', v_args);
  end if;

  v_res := fn_agente_acao(p_pessoa, p_acao, v_args);
  if coalesce((v_res->>'duplicada')::boolean, false) then
    return jsonb_build_object('status', 'duplicada', 'resultado', v_res);
  end if;
  if v_rasc.id is not null then update agente_rascunhos set usado_em = now() where id = v_rasc.id; end if;
  return jsonb_build_object('status', 'feito', 'resultado', v_res);
end $$;

-- Aprovar ou recusar uma pendência. Grava em nome de quem pediu, anotando quem
-- aprovou.
create or replace function public.fn_agente_decidir(p_pessoa uuid, p_pendencia bigint, p_aprovar boolean, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_e agente_equipe;
  v_pend agente_pendencias;
  v_sol agente_equipe;
  v_res jsonb;
begin
  select * into v_e from agente_equipe where id = p_pessoa and ativo;
  if not found then raise exception 'Pessoa não cadastrada ou inativa'; end if;
  if not exists (select 1 from agente_permissoes where papel = v_e.papel and acao = 'aprovar') then
    return jsonb_build_object('status', 'negado', 'motivo', 'O seu papel não aprova pendências.');
  end if;

  select * into v_pend from agente_pendencias where id = p_pendencia for update;
  if not found then return jsonb_build_object('status', 'erro', 'motivo', 'Pendência não encontrada.'); end if;
  if v_pend.status <> 'pendente' then
    return jsonb_build_object('status', 'erro', 'motivo', 'Esta pendência já está ' || v_pend.status || '.');
  end if;
  select * into v_sol from agente_equipe where id = v_pend.solicitante_id;

  if not p_aprovar then
    update agente_pendencias set status = 'recusada', decidido_por = p_pessoa, decidido_em = now(), motivo = p_motivo
     where id = p_pendencia;
    return jsonb_build_object('status', 'recusada', 'solicitante_id', v_sol.id, 'solicitante', v_sol.nome);
  end if;

  if coalesce((fn_agente_cfg('modo_ensaio') #>> '{}')::boolean, true) then
    return jsonb_build_object('status', 'ensaio', 'acao', v_pend.acao, 'args', v_pend.args);
  end if;

  v_res := fn_agente_acao(v_pend.solicitante_id, v_pend.acao, v_pend.args, 'aprovado por ' || v_e.nome);
  if coalesce((v_res->>'duplicada')::boolean, false) then
    update agente_pendencias set status = 'cancelada', decidido_por = p_pessoa, decidido_em = now(),
           motivo = 'duplicada', resultado = v_res where id = p_pendencia;
    return jsonb_build_object('status', 'duplicada', 'resultado', v_res, 'solicitante_id', v_sol.id, 'solicitante', v_sol.nome);
  end if;
  update agente_pendencias set status = 'aprovada', decidido_por = p_pessoa, decidido_em = now(),
         motivo = p_motivo, resultado = v_res where id = p_pendencia;
  return jsonb_build_object('status', 'aprovada', 'resultado', v_res, 'solicitante_id', v_sol.id, 'solicitante', v_sol.nome);
end $$;

-- Só a função de borda (service_role) chama.
do $$
declare f text;
begin
  foreach f in array array[
    'fn_agente_cfg(text)', 'fn_agente_quem(text)', 'fn_agente_estoques_permitidos(uuid,text)',
    'fn_agente_buscar_itens(uuid,text,int)', 'fn_agente_buscar_fornecedor(text)',
    'fn_agente_movimentos(uuid,uuid,int)', 'fn_agente_vendas_zig(date,text)',
    'fn_agente_notas_recentes(int)', 'fn_agente_lista_compras()', 'fn_agente_pendencias_abertas()',
    'fn_agente_rascunho_salvar(uuid,text,jsonb,text)', 'fn_agente_acao(uuid,text,jsonb,text)',
    'fn_agente_executar(uuid,text,jsonb)', 'fn_agente_decidir(uuid,bigint,boolean,text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
