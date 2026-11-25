-- Vale Ditado (Kadu, 25/11/2026): venda online de vales pré-pagos (kits e créditos) em ditado.org/vale,
-- resgate no bar (/vales/resgate) e admin (/vales). Base: docs/PRD-vale-ditado.md.
--
-- Tudo novo, prefixo vale_. Nenhuma tabela existente é alterada (só uma linha nova em modulos_sistema
-- para a permissão do módulo e o bucket de fotos).
--
-- Segurança: todas as tabelas com RLS e sem acesso direto de anon/authenticated. A página pública só
-- passa por funções: a vitrine e o comprovante (leitura, sem CPF) e as edge functions com service role
-- (criar pedido, webhook do gateway). Lote e resgate só por função transacional (SELECT ... FOR UPDATE).

-- ───────────────────────── tabelas ─────────────────────────

create table public.vale_campanha (
  id smallint primary key default 1 check (id = 1),
  fase text not null default 'black' check (fase in ('black', 'natal')),
  ativo boolean not null default false,            -- venda aberta (fora do modo teste, também respeita as datas)
  modo_teste boolean not null default true,         -- sandbox: aceita pedido fora das datas e mostra a faixa "teste"
  venda_inicio timestamptz not null,
  venda_fim timestamptz not null,
  validade_meses integer not null default 6 check (validade_meses between 1 and 24),
  happy_hour_inicio time not null default '06:00',
  happy_hour_fim time not null default '21:00',
  happy_hour_dias integer[] not null default '{0,1,2,3,4,5,6}',   -- 0 = domingo
  brinde_descricao text,
  brinde_ate timestamptz,
  brinde_valor_cardapio numeric(10, 2),
  mostrar_contador boolean not null default true,
  contador_fim timestamptz,
  mostrar_vendidos_a_partir integer not null default 50,
  hero_foto_url text,
  textos jsonb not null default '{}'::jsonb,          -- sobrescreve a copy padrão e guarda os [CONFIRMAR]
  regulamento_md text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table public.vale_produtos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  composicao_texto text not null default '',
  selo_tematico text,
  preco_de numeric(10, 2) not null check (preco_de > 0),
  preco_por numeric(10, 2) not null check (preco_por > 0),
  tipo text not null check (tipo in ('kit', 'credito')),
  credito_valor numeric(10, 2),
  tem_alcool boolean not null default false,
  trava_happy_hour boolean not null default false,
  lote_total integer not null check (lote_total >= 0),
  lote_vendido integer not null default 0 check (lote_vendido >= 0),
  lote_reservado integer not null default 0 check (lote_reservado >= 0),
  limite_por_cpf integer not null default 2 check (limite_por_cpf between 1 and 50),
  foto_url text,
  ordem integer not null default 0,
  categoria text not null default 'kits' check (categoria in ('chopp', 'kits', 'drinks', 'familia', 'credito')),
  destaque_black smallint check (destaque_black between 1 and 3),
  destaque_natal smallint check (destaque_natal between 1 and 3),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (lote_vendido + lote_reservado <= lote_total),
  check (tipo = 'kit' or credito_valor > 0)
);

create table public.vale_produto_itens (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.vale_produtos(id) on delete cascade,
  descricao text not null,
  quantidade integer not null check (quantidade > 0),
  tem_alcool boolean not null default false,
  valor_cardapio numeric(10, 2),     -- preço de cardápio da unidade (base dos 10% proporcionais no resgate)
  ordem integer not null default 0
);
create index vale_produto_itens_produto_idx on public.vale_produto_itens (produto_id);

create table public.vale_pedidos (
  id uuid primary key default gen_random_uuid(),
  token_publico text not null unique,
  nome text not null,
  cpf text not null check (cpf ~ '^\d{11}$'),
  data_nascimento date not null,
  telefone text not null,
  email text,
  presente boolean not null default false,
  presente_nome text,
  presente_cpf text check (presente_cpf is null or presente_cpf ~ '^\d{11}$'),
  aceita_whatsapp boolean not null default false,
  aceita_whatsapp_em timestamptz,
  aceite_regulamento_em timestamptz not null,
  aceite_regras_em timestamptz not null,
  aceite_maioridade_em timestamptz,
  valor_total numeric(10, 2) not null,
  valor_cheio numeric(10, 2) not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'pago', 'expirado', 'cancelado', 'estornado', 'pago_sem_lote')),
  forma_pagamento text not null default 'pix' check (forma_pagamento in ('pix', 'cartao')),
  gateway text,
  gateway_cliente_id text,
  gateway_cobranca_id text unique,
  gateway_url text,
  pix_copia_cola text,
  pix_expira_em timestamptz,
  pago_em timestamptz,
  valor_pago numeric(10, 2),
  reserva_expira_em timestamptz not null,
  encerrado_em timestamptz,
  origem jsonb not null default '{}'::jsonb,
  nfce_status text not null default 'pendente',
  nfce_chave text,
  user_agent text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index vale_pedidos_cpf_idx on public.vale_pedidos (cpf, status);
create index vale_pedidos_status_idx on public.vale_pedidos (status, reserva_expira_em);
create index vale_pedidos_criado_idx on public.vale_pedidos (criado_em desc);

create table public.vale_pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.vale_pedidos(id) on delete cascade,
  produto_id uuid not null references public.vale_produtos(id),
  quantidade integer not null check (quantidade > 0),
  preco_unit numeric(10, 2) not null,
  preco_de_unit numeric(10, 2) not null
);
create index vale_pedido_itens_pedido_idx on public.vale_pedido_itens (pedido_id);
create index vale_pedido_itens_produto_idx on public.vale_pedido_itens (produto_id);

create table public.vale_codigos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  pedido_id uuid not null references public.vale_pedidos(id),
  produto_id uuid not null references public.vale_produtos(id),
  titular_nome text not null,
  titular_cpf text not null check (titular_cpf ~ '^\d{11}$'),
  validade date not null,
  status text not null default 'ativo' check (status in ('ativo', 'parcial', 'resgatado', 'estornado')),
  preco_pago numeric(10, 2) not null,
  credito_total numeric(10, 2),
  saldo_credito numeric(10, 2) check (saldo_credito is null or saldo_credito >= 0),
  com_brinde boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index vale_codigos_pedido_idx on public.vale_codigos (pedido_id);
create index vale_codigos_cpf_idx on public.vale_codigos (titular_cpf);

create table public.vale_codigo_saldos (
  id uuid primary key default gen_random_uuid(),
  codigo_id uuid not null references public.vale_codigos(id) on delete cascade,
  item_id uuid references public.vale_produto_itens(id),
  descricao text not null,
  quantidade_total integer not null check (quantidade_total > 0),
  quantidade_usada integer not null default 0,
  tem_alcool boolean not null default false,
  brinde boolean not null default false,
  valor_cardapio numeric(10, 2),
  ordem integer not null default 0,
  check (quantidade_usada between 0 and quantidade_total)
);
create index vale_codigo_saldos_codigo_idx on public.vale_codigo_saldos (codigo_id);

create table public.vale_resgates (
  id uuid primary key default gen_random_uuid(),
  codigo_id uuid not null references public.vale_codigos(id),
  saldo_id uuid references public.vale_codigo_saldos(id),
  descricao text not null,
  quantidade integer check (quantidade is null or quantidade > 0),
  valor numeric(10, 2) check (valor is null or valor > 0),
  taxa_servico_sugerida numeric(10, 2),
  usuario_id uuid,
  usuario_nome text,
  comanda_zig text,
  documento_conferido boolean not null default false,
  desfeito_em timestamptz,
  desfeito_por text,
  criado_em timestamptz not null default now(),
  check ((quantidade is null) <> (valor is null))
);
create index vale_resgates_codigo_idx on public.vale_resgates (codigo_id, criado_em);

create table public.vale_webhook_eventos (
  id bigint generated always as identity primary key,
  gateway text not null,
  evento_id text not null,
  tipo text,
  cobranca_id text,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  resultado text,
  unique (gateway, evento_id)
);

create table public.vale_estornos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.vale_pedidos(id),
  codigos uuid[] not null default '{}',
  valor numeric(10, 2) not null check (valor > 0),
  motivo text,
  gateway_estorno_id text,
  status text not null default 'solicitado' check (status in ('solicitado', 'concluido', 'falhou')),
  resposta text,
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamptz not null default now()
);
create index vale_estornos_pedido_idx on public.vale_estornos (pedido_id);

do $$
declare t text;
begin
  foreach t in array array['vale_campanha', 'vale_produtos', 'vale_produto_itens', 'vale_pedidos', 'vale_pedido_itens',
                           'vale_codigos', 'vale_codigo_saldos', 'vale_resgates', 'vale_webhook_eventos', 'vale_estornos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ───────────────────────── ajudantes ─────────────────────────

create or replace function public.fn_vale_cpf_valido(p_cpf text)
returns boolean language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'); s integer; r integer; i integer;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

create or replace function public.fn_vale_hoje()
returns date language sql stable as $$ select (now() at time zone 'America/Cuiaba')::date $$;

-- "João P." (primeiro nome + inicial do último sobrenome)
create or replace function public.fn_vale_nome_curto(p_nome text)
returns text language sql immutable as $$
  select case when array_length(p, 1) > 1 then p[1] || ' ' || left(p[array_length(p, 1)], 1) || '.' else coalesce(p[1], '') end
    from (select regexp_split_to_array(initcap(btrim(coalesce(p_nome, ''))), '\s+') p) x
$$;

create or replace function public.fn_vale_token(p_bytes integer)
returns text language sql volatile as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '='), '+/', '-_')
$$;

-- Código do vale: DIT-XXXX-XXXX, sem letras que confundem (0/O, 1/I/L).
create or replace function public.fn_vale_novo_codigo()
returns text language plpgsql volatile as $$
declare a constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; b bytea; c text; i integer;
begin
  loop
    b := extensions.gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(a, (get_byte(b, i) % length(a)) + 1, 1); end loop;
    c := 'DIT-' || left(c, 4) || '-' || right(c, 4);
    exit when not exists (select 1 from vale_codigos where codigo = c);
  end loop;
  return c;
end $$;

-- Quem pode: resgate = usuário ativo com o módulo "vales" (ou admin/master); admin = admin/master.
create or replace function public.fn_vale_pode(p_admin boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.ativo and (
      u.nivel in ('master', 'admin')
      or (not p_admin and exists (
        select 1 from permissoes_usuario p join modulos_sistema m on m.id = p.modulo_id
         where p.usuario_id = u.id and m.slug = 'vales' and p.aba_id is null and p.pode_visualizar)))
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$$;

create or replace function public.fn_vale_usuario_nome()
returns text language sql stable security definer set search_path = public as $$
  select nome_completo from usuarios_sistema where id = fn_usuario_sistema_id()
$$;

-- Situação da venda agora: antes | aberta | encerrada | fechada
create or replace function public.fn_vale_situacao_venda()
returns text language sql stable security definer set search_path = public as $$
  select case
    when c.modo_teste then 'aberta'
    when not c.ativo then 'fechada'
    when now() < c.venda_inicio then 'antes'
    when now() > c.venda_fim then 'encerrada'
    else 'aberta' end
  from vale_campanha c where c.id = 1
$$;

-- Status que o cliente vê (vencido é calculado pela data).
create or replace function public.fn_vale_status_exibido(p_status text, p_validade date)
returns text language sql stable as $$
  select case when p_status in ('ativo', 'parcial') and p_validade < fn_vale_hoje() then 'vencido' else p_status end
$$;

-- O happy hour está valendo agora? (trava dos produtos com chopp no resgate)
create or replace function public.fn_vale_happy_hour_agora()
returns boolean language sql stable security definer set search_path = public as $$
  select extract(dow from (now() at time zone 'America/Cuiaba'))::int = any (c.happy_hour_dias)
     and (now() at time zone 'America/Cuiaba')::time >= c.happy_hour_inicio
     and (now() at time zone 'America/Cuiaba')::time < c.happy_hour_fim
    from vale_campanha c where c.id = 1
$$;

-- ───────────────────────── vitrine (pública) ─────────────────────────

create or replace function public.fn_vale_vitrine()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'agora', now(),
    'situacao', fn_vale_situacao_venda(),
    'campanha', (select jsonb_build_object(
        'fase', c.fase, 'modo_teste', c.modo_teste, 'venda_inicio', c.venda_inicio, 'venda_fim', c.venda_fim,
        'validade_meses', c.validade_meses, 'validade_ate', (fn_vale_hoje() + make_interval(months => c.validade_meses))::date,
        'happy_hour_fim', to_char(c.happy_hour_fim, 'HH24:MI'),
        'brinde_descricao', case when c.brinde_ate > now() then c.brinde_descricao end,
        'brinde_ate', case when c.brinde_ate > now() then c.brinde_ate end,
        'mostrar_contador', c.mostrar_contador, 'contador_fim', c.contador_fim,
        'mostrar_vendidos_a_partir', c.mostrar_vendidos_a_partir, 'hero_foto_url', c.hero_foto_url,
        'textos', c.textos, 'tem_regulamento', coalesce(c.regulamento_md, '') <> '')
      from vale_campanha c where c.id = 1),
    'vendidos_total', (select coalesce(sum(lote_vendido), 0) from vale_produtos where ativo),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'nome', p.nome, 'composicao', p.composicao_texto, 'selo', p.selo_tematico,
        'preco_de', p.preco_de, 'preco_por', p.preco_por, 'tipo', p.tipo, 'credito_valor', p.credito_valor,
        'tem_alcool', p.tem_alcool, 'trava_happy_hour', p.trava_happy_hour, 'lote_total', p.lote_total,
        'restam', p.lote_total - p.lote_vendido - p.lote_reservado, 'vendidos', p.lote_vendido,
        'limite_por_cpf', p.limite_por_cpf, 'foto_url', p.foto_url, 'categoria', p.categoria,
        'destaque_black', p.destaque_black, 'destaque_natal', p.destaque_natal,
        'itens', coalesce((select jsonb_agg(jsonb_build_object('descricao', i.descricao, 'quantidade', i.quantidade,
                   'tem_alcool', i.tem_alcool) order by i.ordem) from vale_produto_itens i where i.produto_id = p.id), '[]'::jsonb))
        order by p.ordem, p.nome) from vale_produtos p where p.ativo), '[]'::jsonb)
  )
$$;

create or replace function public.fn_vale_regulamento()
returns text language sql stable security definer set search_path = public as $$
  select regulamento_md from vale_campanha where id = 1
$$;

-- ───────────────────────── pedido (edge function, service role) ─────────────────────────

-- Valida tudo e reserva o lote. Devolve {ok:true, pedido_id, token, valor_total, reserva_expira_em}
-- ou {ok:false, erro, ...}. Nada é gravado quando volta erro.
-- p: {nome, cpf, nascimento (YYYY-MM-DD), telefone, email, presente, presente_nome, presente_cpf,
--     aceite_regulamento, aceite_regras, aceite_maioridade, aceita_whatsapp, forma_pagamento,
--     origem {}, user_agent, itens: [{slug, quantidade}]}
create or replace function public.fn_vale_reservar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text := btrim(regexp_replace(coalesce(p->>'nome', ''), '\s+', ' ', 'g'));
  v_cpf text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_tel text := regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_pres boolean := coalesce((p->>'presente')::boolean, false);
  v_pnome text := nullif(btrim(regexp_replace(coalesce(p->>'presente_nome', ''), '\s+', ' ', 'g')), '');
  v_pcpf text := nullif(regexp_replace(coalesce(p->>'presente_cpf', ''), '\D', '', 'g'), '');
  v_nasc date; v_idade integer; v_alcool boolean := false;
  v_itens jsonb; it record; pr vale_produtos%rowtype; v_ja integer;
  v_total numeric := 0; v_cheio numeric := 0; v_id uuid; v_token text; v_expira timestamptz;
  v_situacao text := fn_vale_situacao_venda(); v_slugs text[]; v_meu integer; v_livre integer;
begin
  if v_situacao <> 'aberta' then return jsonb_build_object('ok', false, 'erro', 'venda_' || coalesce(v_situacao, 'fechada')); end if;
  if v_nome !~ '\S+\s+\S+' then return jsonb_build_object('ok', false, 'erro', 'nome'); end if;
  if not fn_vale_cpf_valido(v_cpf) then return jsonb_build_object('ok', false, 'erro', 'cpf'); end if;
  begin v_nasc := (p->>'nascimento')::date; exception when others then v_nasc := null; end;
  if v_nasc is null or v_nasc > fn_vale_hoje() or v_nasc < date '1900-01-01' then return jsonb_build_object('ok', false, 'erro', 'nascimento'); end if;
  v_idade := extract(year from age(fn_vale_hoje(), v_nasc))::int;
  if length(v_tel) not between 10 and 11 then return jsonb_build_object('ok', false, 'erro', 'telefone'); end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'erro', 'email'); end if;
  if v_pres then
    if coalesce(v_pnome, '') !~ '\S+\s+\S+' then return jsonb_build_object('ok', false, 'erro', 'presente_nome'); end if;
    if not fn_vale_cpf_valido(v_pcpf) then return jsonb_build_object('ok', false, 'erro', 'presente_cpf'); end if;
  else v_pnome := null; v_pcpf := null; end if;
  if not coalesce((p->>'aceite_regulamento')::boolean, false) or not coalesce((p->>'aceite_regras')::boolean, false) then
    return jsonb_build_object('ok', false, 'erro', 'aceites');
  end if;

  -- itens somados por produto
  select jsonb_agg(jsonb_build_object('slug', slug, 'quantidade', q)), array_agg(slug order by slug) into v_itens, v_slugs
    from (select x->>'slug' slug, sum((x->>'quantidade')::int) q from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) x
           group by 1 having sum((x->>'quantidade')::int) > 0) s;
  if v_itens is null then return jsonb_build_object('ok', false, 'erro', 'carrinho_vazio'); end if;

  -- trava os produtos sempre na mesma ordem (sem deadlock entre compras simultâneas)
  perform 1 from vale_produtos where slug = any (v_slugs) order by slug for update;

  for it in select x->>'slug' slug, (x->>'quantidade')::int q from jsonb_array_elements(v_itens) x loop
    select * into pr from vale_produtos where slug = it.slug;
    if pr.id is null or not pr.ativo then return jsonb_build_object('ok', false, 'erro', 'produto', 'slug', it.slug); end if;
    -- o que este CPF já tem reservado em pedido pendente volta para ele (o pedido novo substitui o antigo)
    select coalesce(sum(i.quantidade), 0) into v_meu from vale_pedido_itens i join vale_pedidos d on d.id = i.pedido_id
     where d.cpf = v_cpf and i.produto_id = pr.id and d.status = 'pendente';
    v_livre := pr.lote_total - pr.lote_vendido - pr.lote_reservado + v_meu;
    if v_livre <= 0 then
      return jsonb_build_object('ok', false, 'erro', 'esgotado', 'slug', it.slug, 'produto', pr.nome, 'restam', 0);
    end if;
    if it.q > v_livre then
      return jsonb_build_object('ok', false, 'erro', 'estoque', 'slug', it.slug, 'produto', pr.nome, 'restam', v_livre);
    end if;
    select coalesce(sum(i.quantidade), 0) into v_ja from vale_pedido_itens i join vale_pedidos d on d.id = i.pedido_id
     where d.cpf = v_cpf and i.produto_id = pr.id and d.status in ('pago', 'pago_sem_lote');
    if v_ja + it.q > pr.limite_por_cpf then
      return jsonb_build_object('ok', false, 'erro', 'limite_cpf', 'slug', it.slug, 'produto', pr.nome,
                                'limite', pr.limite_por_cpf, 'ainda_pode', greatest(pr.limite_por_cpf - v_ja, 0));
    end if;
    v_alcool := v_alcool or pr.tem_alcool;
    v_total := v_total + pr.preco_por * it.q;
    v_cheio := v_cheio + pr.preco_de * it.q;
  end loop;

  if v_alcool and v_idade < 18 then return jsonb_build_object('ok', false, 'erro', 'menor_alcool'); end if;
  if v_alcool and not coalesce((p->>'aceite_maioridade')::boolean, false) then return jsonb_build_object('ok', false, 'erro', 'aceites'); end if;

  -- pedidos pendentes anteriores do mesmo CPF: o novo substitui (devolvem o lote)
  perform fn_vale_encerrar_pedido(x.id, 'cancelado') from vale_pedidos x where x.cpf = v_cpf and x.status = 'pendente';

  v_token := fn_vale_token(18);
  v_expira := now() + interval '30 minutes';
  insert into vale_pedidos (token_publico, nome, cpf, data_nascimento, telefone, email, presente, presente_nome, presente_cpf,
    aceita_whatsapp, aceita_whatsapp_em, aceite_regulamento_em, aceite_regras_em, aceite_maioridade_em,
    valor_total, valor_cheio, forma_pagamento, reserva_expira_em, origem, user_agent)
  values (v_token, initcap(lower(v_nome)), v_cpf, v_nasc, v_tel, v_email, v_pres, initcap(lower(v_pnome)), v_pcpf,
    coalesce((p->>'aceita_whatsapp')::boolean, false),
    case when coalesce((p->>'aceita_whatsapp')::boolean, false) then now() end,
    now(), now(), case when v_alcool then now() end,
    v_total, v_cheio, case when p->>'forma_pagamento' = 'cartao' then 'cartao' else 'pix' end, v_expira,
    coalesce(p->'origem', '{}'::jsonb), left(p->>'user_agent', 300))
  returning id into v_id;

  for it in select x->>'slug' slug, (x->>'quantidade')::int q from jsonb_array_elements(v_itens) x loop
    insert into vale_pedido_itens (pedido_id, produto_id, quantidade, preco_unit, preco_de_unit)
    select v_id, pr2.id, it.q, pr2.preco_por, pr2.preco_de from vale_produtos pr2 where pr2.slug = it.slug;
    update vale_produtos set lote_reservado = lote_reservado + it.q, atualizado_em = now() where slug = it.slug;
  end loop;

  return jsonb_build_object('ok', true, 'pedido_id', v_id, 'token', v_token, 'valor_total', v_total,
                            'reserva_expira_em', v_expira, 'nome', initcap(lower(v_nome)), 'cpf', v_cpf,
                            'telefone', v_tel, 'email', v_email);
end $$;

-- Encerra um pedido pendente (cancelado ou expirado) e devolve o lote reservado.
create or replace function public.fn_vale_encerrar_pedido(p_pedido uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare d vale_pedidos%rowtype;
begin
  if p_status not in ('cancelado', 'expirado') then raise exception 'status inválido'; end if;
  select * into d from vale_pedidos where id = p_pedido for update;
  if d.id is null or d.status <> 'pendente' then return false; end if;
  perform 1 from vale_produtos where id in (select produto_id from vale_pedido_itens where pedido_id = d.id) order by slug for update;
  update vale_produtos pr set lote_reservado = greatest(pr.lote_reservado - i.q, 0), atualizado_em = now()
    from (select produto_id, sum(quantidade) q from vale_pedido_itens where pedido_id = d.id group by 1) i
   where pr.id = i.produto_id;
  update vale_pedidos set status = p_status, encerrado_em = now(), atualizado_em = now() where id = d.id;
  return true;
end $$;

-- Grava a cobrança criada no gateway.
create or replace function public.fn_vale_cobranca_gravar(p_pedido uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update vale_pedidos set gateway = p->>'gateway', gateway_cliente_id = p->>'cliente_id', gateway_cobranca_id = p->>'cobranca_id',
         gateway_url = p->>'url', pix_copia_cola = p->>'pix_copia_cola', pix_expira_em = (p->>'pix_expira_em')::timestamptz,
         atualizado_em = now()
   where id = p_pedido;
end $$;

-- Pix/cartão confirmado pelo gateway: gera os vales. Idempotente (pedido já pago devolve 'ja_pago').
-- Pedido expirado/cancelado que foi pago depois: emite se ainda houver lote; senão fica 'pago_sem_lote' (estornar no admin).
create or replace function public.fn_vale_confirmar_pagamento(p_cobranca text, p_pago_em timestamptz, p_valor numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d vale_pedidos%rowtype; c vale_campanha%rowtype; it record; s record; v_cod uuid; v_n integer;
  v_falta boolean := false; v_brinde boolean; v_validade date; v_codigos integer := 0; v_pago timestamptz := coalesce(p_pago_em, now());
begin
  select * into d from vale_pedidos where gateway_cobranca_id = p_cobranca for update;
  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
  if d.status in ('pago', 'pago_sem_lote', 'estornado') then return jsonb_build_object('ok', true, 'resultado', 'ja_pago', 'pedido_id', d.id); end if;
  if p_valor is not null and p_valor + 0.009 < d.valor_total then
    return jsonb_build_object('ok', false, 'erro', 'valor_menor', 'pedido_id', d.id);
  end if;
  select * into c from vale_campanha where id = 1;

  perform 1 from vale_produtos where id in (select produto_id from vale_pedido_itens where pedido_id = d.id) order by slug for update;
  if d.status = 'pendente' then
    update vale_produtos pr set lote_reservado = greatest(pr.lote_reservado - i.q, 0), lote_vendido = pr.lote_vendido + i.q, atualizado_em = now()
      from (select produto_id, sum(quantidade) q from vale_pedido_itens where pedido_id = d.id group by 1) i where pr.id = i.produto_id;
  else
    select bool_or(pr.lote_total - pr.lote_vendido - pr.lote_reservado < i.q) into v_falta
      from (select produto_id, sum(quantidade) q from vale_pedido_itens where pedido_id = d.id group by 1) i join vale_produtos pr on pr.id = i.produto_id;
    if v_falta then
      update vale_pedidos set status = 'pago_sem_lote', pago_em = v_pago, valor_pago = p_valor, atualizado_em = now() where id = d.id;
      return jsonb_build_object('ok', true, 'resultado', 'pago_sem_lote', 'pedido_id', d.id);
    end if;
    update vale_produtos pr set lote_vendido = pr.lote_vendido + i.q, atualizado_em = now()
      from (select produto_id, sum(quantidade) q from vale_pedido_itens where pedido_id = d.id group by 1) i where pr.id = i.produto_id;
  end if;

  v_validade := ((v_pago at time zone 'America/Cuiaba')::date + make_interval(months => c.validade_meses))::date;
  v_brinde := c.brinde_ate is not null and c.brinde_descricao is not null and v_pago <= c.brinde_ate;

  for it in select i.*, pr.tipo, pr.credito_valor from vale_pedido_itens i join vale_produtos pr on pr.id = i.produto_id where i.pedido_id = d.id loop
    for v_n in 1..it.quantidade loop
      insert into vale_codigos (codigo, pedido_id, produto_id, titular_nome, titular_cpf, validade, preco_pago,
                                credito_total, saldo_credito, com_brinde)
      values (fn_vale_novo_codigo(), d.id, it.produto_id, coalesce(d.presente_nome, d.nome), coalesce(d.presente_cpf, d.cpf),
              v_validade, it.preco_unit,
              case when it.tipo = 'credito' then it.credito_valor end, case when it.tipo = 'credito' then it.credito_valor end, v_brinde)
      returning id into v_cod;
      insert into vale_codigo_saldos (codigo_id, item_id, descricao, quantidade_total, tem_alcool, valor_cardapio, ordem)
      select v_cod, i.id, i.descricao, i.quantidade, i.tem_alcool, i.valor_cardapio, i.ordem
        from vale_produto_itens i where i.produto_id = it.produto_id and it.tipo = 'kit';
      if v_brinde then
        insert into vale_codigo_saldos (codigo_id, descricao, quantidade_total, brinde, valor_cardapio, ordem)
        values (v_cod, c.brinde_descricao || ' (brinde Black)', 1, true, c.brinde_valor_cardapio, 999);
      end if;
      v_codigos := v_codigos + 1;
    end loop;
  end loop;

  update vale_pedidos set status = 'pago', pago_em = v_pago, valor_pago = p_valor, atualizado_em = now() where id = d.id;
  return jsonb_build_object('ok', true, 'resultado', 'pago', 'pedido_id', d.id, 'codigos', v_codigos);
end $$;

-- Robô (pg_cron): reserva de 30 min vencida devolve o lote.
create or replace function public.fn_vale_expirar_reservas()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from vale_pedidos where status = 'pendente' and reserva_expira_em < now() order by reserva_expira_em limit 500 loop
    if fn_vale_encerrar_pedido(r.id, 'expirado') then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Dados do pedido para a edge function (status, cobrança).
create or replace function public.fn_vale_pedido_interno(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(d) - 'cpf' - 'presente_cpf' - 'data_nascimento' from vale_pedidos d where d.token_publico = p_token
$$;

-- ───────────────────────── comprovante e consulta (públicos, sem CPF) ─────────────────────────

create or replace function public.fn_vale_codigo_json(p_codigo_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'codigo', k.codigo, 'produto', pr.nome, 'slug', pr.slug, 'tipo', pr.tipo, 'titular', fn_vale_nome_curto(k.titular_nome),
    'validade', k.validade, 'status', fn_vale_status_exibido(k.status, k.validade),
    'credito_total', k.credito_total, 'saldo_credito', k.saldo_credito, 'trava_happy_hour', pr.trava_happy_hour,
    'saldos', coalesce((select jsonb_agg(jsonb_build_object('descricao', s.descricao, 'total', s.quantidade_total,
               'usado', s.quantidade_usada, 'brinde', s.brinde) order by s.ordem) from vale_codigo_saldos s where s.codigo_id = k.id), '[]'::jsonb))
  from vale_codigos k join vale_produtos pr on pr.id = k.produto_id where k.id = p_codigo_id
$$;

create or replace function public.fn_vale_pedido_publico(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d vale_pedidos%rowtype;
begin
  if coalesce(length(p_token), 0) < 16 then return null; end if;
  select * into d from vale_pedidos where token_publico = p_token;
  if d.id is null then return null; end if;
  return jsonb_build_object(
    'status', d.status, 'forma_pagamento', d.forma_pagamento, 'valor_total', d.valor_total, 'valor_cheio', d.valor_cheio,
    'presente', d.presente, 'comprador', fn_vale_nome_curto(d.nome), 'presenteado', fn_vale_nome_curto(d.presente_nome),
    'pix_copia_cola', case when d.status = 'pendente' then d.pix_copia_cola end,
    'gateway_url', case when d.status = 'pendente' then d.gateway_url end,
    'reserva_expira_em', d.reserva_expira_em, 'pago_em', d.pago_em, 'agora', now(),
    'itens', (select jsonb_agg(jsonb_build_object('produto', pr.nome, 'slug', pr.slug, 'quantidade', i.quantidade,
                'preco', i.preco_unit, 'restam', pr.lote_total - pr.lote_vendido - pr.lote_reservado)) from vale_pedido_itens i
               join vale_produtos pr on pr.id = i.produto_id where i.pedido_id = d.id),
    'vales', coalesce((select jsonb_agg(fn_vale_codigo_json(k.id) order by k.criado_em, k.codigo) from vale_codigos k where k.pedido_id = d.id), '[]'::jsonb));
end $$;

-- /vale/consultar: código + 3 primeiros dígitos do CPF do titular.
create or replace function public.fn_vale_consultar(p_codigo text, p_cpf3 text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k vale_codigos%rowtype;
begin
  select * into k from vale_codigos where codigo = upper(btrim(coalesce(p_codigo, '')));
  if k.id is null or left(k.titular_cpf, 3) <> regexp_replace(coalesce(p_cpf3, ''), '\D', '', 'g') then return null; end if;
  return fn_vale_codigo_json(k.id);
end $$;

-- ───────────────────────── resgate (interno) ─────────────────────────

create or replace function public.fn_vale_resgate_ler(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k vale_codigos%rowtype; pr vale_produtos%rowtype; v_cod text;
begin
  if not fn_vale_pode(false) then raise exception 'sem acesso ao resgate de vales'; end if;
  v_cod := upper(btrim(regexp_replace(coalesce(p_codigo, ''), '^.*/', '')));
  if v_cod !~ '^DIT-' and length(v_cod) = 8 then v_cod := 'DIT-' || left(v_cod, 4) || '-' || right(v_cod, 4); end if;
  select * into k from vale_codigos where codigo = v_cod;
  if k.id is null then return jsonb_build_object('encontrado', false); end if;
  select * into pr from vale_produtos where id = k.produto_id;
  return jsonb_build_object(
    'encontrado', true, 'id', k.id, 'codigo', k.codigo, 'produto', pr.nome, 'tipo', pr.tipo,
    'titular', fn_vale_nome_curto(k.titular_nome), 'validade', k.validade,
    'status', fn_vale_status_exibido(k.status, k.validade), 'preco_pago', k.preco_pago, 'preco_de', pr.preco_de,
    'credito_total', k.credito_total, 'saldo_credito', k.saldo_credito,
    'trava_happy_hour', pr.trava_happy_hour, 'happy_hour_agora', fn_vale_happy_hour_agora(),
    'happy_hour_fim', (select to_char(happy_hour_fim, 'HH24:MI') from vale_campanha where id = 1),
    'saldos', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'descricao', s.descricao, 'total', s.quantidade_total,
               'usado', s.quantidade_usada, 'tem_alcool', s.tem_alcool, 'brinde', s.brinde) order by s.ordem)
               from vale_codigo_saldos s where s.codigo_id = k.id), '[]'::jsonb),
    'resgates', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'descricao', r.descricao, 'quantidade', r.quantidade,
               'valor', r.valor, 'quem', r.usuario_nome, 'quando', r.criado_em, 'comanda', r.comanda_zig,
               'desfeito', r.desfeito_em is not null) order by r.criado_em desc) from vale_resgates r where r.codigo_id = k.id), '[]'::jsonb));
end $$;

-- Baixa parcial. p_itens: [{saldo_id, quantidade}] (kit) ou p_valor (crédito).
-- Item com álcool exige documento conferido; crédito usado em bebida alcoólica também (p_credito_alcool).
-- Produto com trava de happy hour não baixa durante o happy hour.
create or replace function public.fn_vale_resgatar(p_codigo text, p_itens jsonb, p_valor numeric, p_comanda text,
                                                    p_documento boolean, p_credito_alcool boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k vale_codigos%rowtype; pr vale_produtos%rowtype; s vale_codigo_saldos%rowtype; it record;
  v_uid uuid := fn_usuario_sistema_id(); v_nome text := fn_vale_usuario_nome(); v_taxa numeric; v_n integer := 0;
  v_fator numeric;
begin
  if not fn_vale_pode(false) then raise exception 'sem acesso ao resgate de vales'; end if;
  select * into k from vale_codigos where codigo = upper(btrim(coalesce(p_codigo, ''))) for update;
  if k.id is null then raise exception 'vale não encontrado'; end if;
  if k.status = 'estornado' then raise exception 'este vale foi cancelado e o valor devolvido'; end if;
  if k.status = 'resgatado' then raise exception 'este vale já foi todo usado'; end if;
  if k.validade < fn_vale_hoje() then raise exception 'este vale venceu em %', to_char(k.validade, 'DD/MM/YYYY'); end if;
  select * into pr from vale_produtos where id = k.produto_id;
  if pr.trava_happy_hour and fn_vale_happy_hour_agora() then
    raise exception 'produto com chopp não vale no happy hour: libera às %', (select to_char(happy_hour_fim, 'HH24:MI') from vale_campanha where id = 1);
  end if;
  -- 10% sobre o valor pago, proporcional ao preço de cardápio do que foi usado
  v_fator := case when pr.preco_de > 0 then k.preco_pago / pr.preco_de else 1 end;

  if pr.tipo = 'credito' then
    if p_valor is null or p_valor <= 0 then raise exception 'informe o valor a abater'; end if;
    if p_valor > k.saldo_credito then raise exception 'o valor passa do saldo (R$ %)', replace(to_char(k.saldo_credito, 'FM999990.00'), '.', ','); end if;
    if coalesce(p_credito_alcool, false) and not coalesce(p_documento, false) then raise exception 'confira o documento com foto antes de baixar bebida alcoólica'; end if;
    v_taxa := round(p_valor * (k.preco_pago / nullif(k.credito_total, 0)) * 0.10, 2);
    update vale_codigos set saldo_credito = saldo_credito - p_valor, atualizado_em = now(),
           status = case when saldo_credito - p_valor <= 0 then 'resgatado' else 'parcial' end where id = k.id;
    insert into vale_resgates (codigo_id, descricao, valor, taxa_servico_sugerida, usuario_id, usuario_nome, comanda_zig, documento_conferido)
    values (k.id, 'Crédito', round(p_valor, 2), v_taxa, v_uid, v_nome, nullif(btrim(coalesce(p_comanda, '')), ''), coalesce(p_documento, false));
    v_n := 1;
  else
    for it in select (x->>'saldo_id')::uuid saldo_id, (x->>'quantidade')::int q from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x loop
      if coalesce(it.q, 0) <= 0 then continue; end if;
      select * into s from vale_codigo_saldos where id = it.saldo_id and codigo_id = k.id for update;
      if s.id is null then raise exception 'item não pertence a este vale'; end if;
      if s.quantidade_usada + it.q > s.quantidade_total then
        raise exception 'só restam % de %', s.quantidade_total - s.quantidade_usada, s.descricao;
      end if;
      if s.tem_alcool and not coalesce(p_documento, false) then raise exception 'confira o documento com foto antes de baixar bebida alcoólica'; end if;
      update vale_codigo_saldos set quantidade_usada = quantidade_usada + it.q where id = s.id;
      v_taxa := case when s.brinde then 0 else round(coalesce(s.valor_cardapio, 0) * it.q * v_fator * 0.10, 2) end;
      insert into vale_resgates (codigo_id, saldo_id, descricao, quantidade, taxa_servico_sugerida, usuario_id, usuario_nome, comanda_zig, documento_conferido)
      values (k.id, s.id, s.descricao, it.q, v_taxa, v_uid, v_nome, nullif(btrim(coalesce(p_comanda, '')), ''), coalesce(p_documento, false));
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'escolha o que o cliente vai usar'; end if;
    update vale_codigos set atualizado_em = now(),
           status = case when not exists (select 1 from vale_codigo_saldos where codigo_id = k.id and quantidade_usada < quantidade_total)
                         then 'resgatado' else 'parcial' end
     where id = k.id;
  end if;
  return fn_vale_resgate_ler(k.codigo);
end $$;

-- Desfazer uma baixa lançada errada (admin/master).
create or replace function public.fn_vale_resgate_desfazer(p_resgate uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r vale_resgates%rowtype; k vale_codigos%rowtype;
begin
  if not fn_vale_pode(true) then raise exception 'só gerente desfaz baixa'; end if;
  select * into r from vale_resgates where id = p_resgate for update;
  if r.id is null or r.desfeito_em is not null then raise exception 'baixa não encontrada ou já desfeita'; end if;
  select * into k from vale_codigos where id = r.codigo_id for update;
  if k.status = 'estornado' then raise exception 'vale estornado'; end if;
  if r.valor is not null then
    update vale_codigos set saldo_credito = saldo_credito + r.valor where id = k.id;
  else
    update vale_codigo_saldos set quantidade_usada = quantidade_usada - r.quantidade where id = r.saldo_id;
  end if;
  update vale_resgates set desfeito_em = now(), desfeito_por = fn_vale_usuario_nome() where id = r.id;
  update vale_codigos set atualizado_em = now(), status = case
      when (k.credito_total is not null and saldo_credito >= k.credito_total)
        or (k.credito_total is null and not exists (select 1 from vale_codigo_saldos where codigo_id = k.id and quantidade_usada > 0)) then 'ativo'
      else 'parcial' end
   where id = k.id;
  return fn_vale_resgate_ler(k.codigo);
end $$;

-- ───────────────────────── admin ─────────────────────────

create or replace function public.fn_vale_admin_dados()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_vale_pode(true) then raise exception 'só gerente'; end if;
  return jsonb_build_object(
    'campanha', (select to_jsonb(c) from vale_campanha c where c.id = 1),
    'situacao', fn_vale_situacao_venda(),
    'produtos', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('itens',
        coalesce((select jsonb_agg(to_jsonb(i) order by i.ordem) from vale_produto_itens i where i.produto_id = p.id), '[]'::jsonb))
        order by p.ordem) from vale_produtos p), '[]'::jsonb));
end $$;

create or replace function public.fn_vale_admin_campanha_salvar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_vale_pode(true) then raise exception 'só gerente'; end if;
  update vale_campanha c set
    fase = coalesce(p->>'fase', c.fase),
    ativo = coalesce((p->>'ativo')::boolean, c.ativo),
    modo_teste = coalesce((p->>'modo_teste')::boolean, c.modo_teste),
    venda_inicio = coalesce((p->>'venda_inicio')::timestamptz, c.venda_inicio),
    venda_fim = coalesce((p->>'venda_fim')::timestamptz, c.venda_fim),
    validade_meses = coalesce((p->>'validade_meses')::int, c.validade_meses),
    happy_hour_inicio = coalesce((p->>'happy_hour_inicio')::time, c.happy_hour_inicio),
    happy_hour_fim = coalesce((p->>'happy_hour_fim')::time, c.happy_hour_fim),
    happy_hour_dias = coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'happy_hour_dias') x), c.happy_hour_dias),
    brinde_descricao = case when p ? 'brinde_descricao' then nullif(btrim(p->>'brinde_descricao'), '') else c.brinde_descricao end,
    brinde_ate = case when p ? 'brinde_ate' then (p->>'brinde_ate')::timestamptz else c.brinde_ate end,
    brinde_valor_cardapio = case when p ? 'brinde_valor_cardapio' then (p->>'brinde_valor_cardapio')::numeric else c.brinde_valor_cardapio end,
    mostrar_contador = coalesce((p->>'mostrar_contador')::boolean, c.mostrar_contador),
    contador_fim = case when p ? 'contador_fim' then (p->>'contador_fim')::timestamptz else c.contador_fim end,
    mostrar_vendidos_a_partir = coalesce((p->>'mostrar_vendidos_a_partir')::int, c.mostrar_vendidos_a_partir),
    hero_foto_url = case when p ? 'hero_foto_url' then nullif(p->>'hero_foto_url', '') else c.hero_foto_url end,
    textos = case when p ? 'textos' then coalesce(p->'textos', '{}'::jsonb) else c.textos end,
    regulamento_md = case when p ? 'regulamento_md' then p->>'regulamento_md' else c.regulamento_md end,
    atualizado_em = now(), atualizado_por = fn_usuario_sistema_id()
  where c.id = 1;
end $$;

-- Cria (sem id) ou edita um produto, com a lista de itens do kit. Lote não pode ficar abaixo do vendido + reservado.
create or replace function public.fn_vale_admin_produto_salvar(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; x jsonb; v_ids uuid[] := '{}'; v_item uuid;
begin
  if not fn_vale_pode(true) then raise exception 'só gerente'; end if;
  if v_id is null then
    insert into vale_produtos (slug, nome, composicao_texto, selo_tematico, preco_de, preco_por, tipo, credito_valor, tem_alcool,
      trava_happy_hour, lote_total, limite_por_cpf, foto_url, ordem, categoria, destaque_black, destaque_natal, ativo)
    values (p->>'slug', p->>'nome', coalesce(p->>'composicao_texto', ''), nullif(p->>'selo_tematico', ''), (p->>'preco_de')::numeric,
      (p->>'preco_por')::numeric, p->>'tipo', nullif(p->>'credito_valor', '')::numeric, coalesce((p->>'tem_alcool')::boolean, false),
      coalesce((p->>'trava_happy_hour')::boolean, false), (p->>'lote_total')::int, coalesce((p->>'limite_por_cpf')::int, 2),
      nullif(p->>'foto_url', ''), coalesce((p->>'ordem')::int, 99), coalesce(p->>'categoria', 'kits'),
      nullif(p->>'destaque_black', '')::smallint, nullif(p->>'destaque_natal', '')::smallint, coalesce((p->>'ativo')::boolean, true))
    returning id into v_id;
  else
    perform 1 from vale_produtos where id = v_id for update;
    update vale_produtos set slug = coalesce(p->>'slug', slug), nome = coalesce(p->>'nome', nome),
      composicao_texto = coalesce(p->>'composicao_texto', composicao_texto),
      selo_tematico = case when p ? 'selo_tematico' then nullif(p->>'selo_tematico', '') else selo_tematico end,
      preco_de = coalesce((p->>'preco_de')::numeric, preco_de), preco_por = coalesce((p->>'preco_por')::numeric, preco_por),
      tipo = coalesce(p->>'tipo', tipo),
      credito_valor = case when p ? 'credito_valor' then nullif(p->>'credito_valor', '')::numeric else credito_valor end,
      tem_alcool = coalesce((p->>'tem_alcool')::boolean, tem_alcool),
      trava_happy_hour = coalesce((p->>'trava_happy_hour')::boolean, trava_happy_hour),
      lote_total = coalesce((p->>'lote_total')::int, lote_total), limite_por_cpf = coalesce((p->>'limite_por_cpf')::int, limite_por_cpf),
      foto_url = case when p ? 'foto_url' then nullif(p->>'foto_url', '') else foto_url end,
      ordem = coalesce((p->>'ordem')::int, ordem), categoria = coalesce(p->>'categoria', categoria),
      destaque_black = case when p ? 'destaque_black' then nullif(p->>'destaque_black', '')::smallint else destaque_black end,
      destaque_natal = case when p ? 'destaque_natal' then nullif(p->>'destaque_natal', '')::smallint else destaque_natal end,
      ativo = coalesce((p->>'ativo')::boolean, ativo), atualizado_em = now()
    where id = v_id;
  end if;

  -- itens do kit (só valem para vales emitidos depois; os já emitidos guardam o próprio saldo)
  if p ? 'itens' then
    for x in select * from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) loop
      v_item := nullif(x->>'id', '')::uuid;
      if v_item is null then
        insert into vale_produto_itens (produto_id, descricao, quantidade, tem_alcool, valor_cardapio, ordem)
        values (v_id, x->>'descricao', (x->>'quantidade')::int, coalesce((x->>'tem_alcool')::boolean, false),
                nullif(x->>'valor_cardapio', '')::numeric, coalesce((x->>'ordem')::int, 0))
        returning id into v_item;
      else
        update vale_produto_itens set descricao = x->>'descricao', quantidade = (x->>'quantidade')::int,
               tem_alcool = coalesce((x->>'tem_alcool')::boolean, false), valor_cardapio = nullif(x->>'valor_cardapio', '')::numeric,
               ordem = coalesce((x->>'ordem')::int, 0)
         where id = v_item and produto_id = v_id;
      end if;
      v_ids := v_ids || v_item;
    end loop;
    -- item que saiu da lista: some do produto (o saldo dos vales já emitidos não muda)
    update vale_codigo_saldos set item_id = null where item_id in (select id from vale_produto_itens where produto_id = v_id and id <> all (v_ids));
    delete from vale_produto_itens where produto_id = v_id and id <> all (v_ids);
  end if;
  return v_id;
end $$;

-- Lista de pedidos (CPF mascarado).
create or replace function public.fn_vale_admin_pedidos(p_status text default null, p_busca text default null, p_limite integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_b text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  if not fn_vale_pode(true) then raise exception 'só gerente'; end if;
  return coalesce((select jsonb_agg(x order by x->>'criado_em' desc) from (
    select jsonb_build_object('id', d.id, 'token', d.token_publico, 'nome', d.nome,
      'cpf', '***.' || substr(d.cpf, 4, 3) || '.' || substr(d.cpf, 7, 3) || '-**', 'telefone', d.telefone, 'email', d.email,
      'presente', d.presente, 'presente_nome', d.presente_nome, 'status', d.status, 'forma', d.forma_pagamento,
      'valor_total', d.valor_total, 'valor_cheio', d.valor_cheio, 'pago_em', d.pago_em, 'criado_em', d.criado_em,
      'aceita_whatsapp', d.aceita_whatsapp, 'origem', d.origem, 'gateway_cobranca_id', d.gateway_cobranca_id,
      'itens', (select jsonb_agg(jsonb_build_object('produto', pr.nome, 'quantidade', i.quantidade, 'preco', i.preco_unit))
                  from vale_pedido_itens i join vale_produtos pr on pr.id = i.produto_id where i.pedido_id = d.id),
      'vales', (select jsonb_agg(jsonb_build_object('id', k.id, 'codigo', k.codigo, 'produto', pr.nome,
                  'status', fn_vale_status_exibido(k.status, k.validade), 'validade', k.validade,
                  'usado', exists (select 1 from vale_resgates r where r.codigo_id = k.id and r.desfeito_em is null)) order by k.codigo)
                  from vale_codigos k join vale_produtos pr on pr.id = k.produto_id where k.pedido_id = d.id),
      'estornos', (select jsonb_agg(jsonb_build_object('valor', e.valor, 'status', e.status, 'quando', e.criado_em, 'quem', e.usuario_nome))
                  from vale_estornos e where e.pedido_id = d.id)) x
      from vale_pedidos d
     where (p_status is null or d.status = p_status)
       and (v_b is null or d.nome ilike '%' || v_b || '%' or d.telefone like '%' || regexp_replace(v_b, '\D', '', 'g') || '%'
            or d.cpf = regexp_replace(v_b, '\D', '', 'g')
            or exists (select 1 from vale_codigos k where k.pedido_id = d.id and k.codigo ilike '%' || v_b || '%'))
     order by d.criado_em desc limit greatest(least(coalesce(p_limite, 300), 2000), 1)) t), '[]'::jsonb);
end $$;

-- Painel: vendas, receita, lote, resgate, passivo e perfil dos compradores (cruzando com a fidelidade).
create or replace function public.fn_vale_admin_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_vale_pode(true) then raise exception 'só gerente'; end if;
  return jsonb_build_object(
    'pedidos_pagos', (select count(*) from vale_pedidos where status = 'pago'),
    'receita', (select coalesce(sum(valor_total), 0) from vale_pedidos where status = 'pago'),
    'estornado', (select coalesce(sum(valor), 0) from vale_estornos where status = 'concluido'),
    'pendentes', (select count(*) from vale_pedidos where status = 'pendente'),
    'pago_sem_lote', (select count(*) from vale_pedidos where status = 'pago_sem_lote'),
    'vales', (select count(*) from vale_codigos where status <> 'estornado'),
    'por_produto', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'vendidos', p.lote_vendido, 'reservados', p.lote_reservado,
        'lote', p.lote_total, 'receita', (select coalesce(sum(k.preco_pago), 0) from vale_codigos k where k.produto_id = p.id and k.status <> 'estornado'))
        order by p.ordem) from vale_produtos p), '[]'::jsonb),
    -- % resgatado e passivo (R$ pagos ainda a entregar), proporcional ao preço de cardápio do que falta
    'resgate', (select jsonb_build_object(
        'pct_resgatado', round(100 * coalesce(sum(k.preco_pago - z.passivo), 0) / nullif(sum(k.preco_pago), 0), 1),
        'passivo', round(coalesce(sum(z.passivo), 0), 2))
      from vale_codigos k join vale_produtos p on p.id = k.produto_id
      cross join lateral (select case
          when p.tipo = 'credito' then k.saldo_credito * k.preco_pago / nullif(k.credito_total, 0)
          else k.preco_pago * coalesce((select sum((s.quantidade_total - s.quantidade_usada) * coalesce(s.valor_cardapio, 1))
                 / nullif(sum(s.quantidade_total * coalesce(s.valor_cardapio, 1)), 0)
                 from vale_codigo_saldos s where s.codigo_id = k.id and not s.brinde), 0) end passivo) z
      where k.status <> 'estornado' and k.validade >= fn_vale_hoje()),
    'compradores', (select jsonb_build_object(
        'total', count(*),
        'novos', count(*) filter (where f.cpf is null),
        'sumidos_60', count(*) filter (where f.ultima_visita < c.primeira_compra::date - 60),
        'ativos', count(*) filter (where f.ultima_visita >= c.primeira_compra::date - 60))
      from (select cpf, min(pago_em) primeira_compra from vale_pedidos where status = 'pago' group by cpf) c
      left join fidelidade_clientes f on f.cpf = c.cpf),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'pedidos', n, 'receita', v) order by dia) from (
        select (pago_em at time zone 'America/Cuiaba')::date dia, count(*) n, sum(valor_total) v from vale_pedidos where status = 'pago' group by 1) t), '[]'::jsonb),
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', o, 'pedidos', n, 'receita', v)) from (
        select coalesce(nullif(origem->>'utm_source', ''), nullif(origem->>'seg', ''), 'direto') o, count(*) n, sum(valor_total) v
          from vale_pedidos where status = 'pago' group by 1) t), '[]'::jsonb));
end $$;

-- Estorno em 2 passos: o admin pede (confere e calcula o valor), a edge function estorna no gateway e conclui.
-- Regra: vale não usado → devolve integral; usado dentro de 7 dias → proporcional ao que falta (decisão do gerente).
create or replace function public.fn_vale_estorno_preparar(p_pedido uuid, p_codigos uuid[], p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d vale_pedidos%rowtype; v_valor numeric := 0; v_id uuid; k record; v_cods uuid[];
begin
  if not fn_vale_pode(true) then raise exception 'só gerente faz estorno'; end if;
  select * into d from vale_pedidos where id = p_pedido for update;
  if d.id is null then raise exception 'pedido não encontrado'; end if;
  if d.status not in ('pago', 'pago_sem_lote') then raise exception 'pedido não está pago'; end if;
  if exists (select 1 from vale_estornos where pedido_id = d.id and status = 'solicitado') then raise exception 'já há um estorno em andamento neste pedido'; end if;

  if d.status = 'pago_sem_lote' then
    v_valor := coalesce(d.valor_pago, d.valor_total); v_cods := '{}';
  else
    select array_agg(id) into v_cods from vale_codigos
     where pedido_id = d.id and status <> 'estornado' and (p_codigos is null or id = any (p_codigos));
    if v_cods is null then raise exception 'nenhum vale para estornar'; end if;
    for k in select c.*, p.tipo from vale_codigos c join vale_produtos p on p.id = c.produto_id where c.id = any (v_cods) loop
      v_valor := v_valor + case
        when k.tipo = 'credito' then k.preco_pago * k.saldo_credito / nullif(k.credito_total, 0)
        else k.preco_pago * coalesce((select sum((s.quantidade_total - s.quantidade_usada) * coalesce(s.valor_cardapio, 1))
               / nullif(sum(s.quantidade_total * coalesce(s.valor_cardapio, 1)), 0) from vale_codigo_saldos s where s.codigo_id = k.id and not s.brinde), 0) end;
    end loop;
    v_valor := round(v_valor, 2);
  end if;
  if v_valor <= 0 then raise exception 'não há valor a devolver: os vales já foram usados'; end if;
  insert into vale_estornos (pedido_id, codigos, valor, motivo, usuario_id, usuario_nome)
  values (d.id, v_cods, v_valor, nullif(btrim(coalesce(p_motivo, '')), ''), fn_usuario_sistema_id(), fn_vale_usuario_nome())
  returning id into v_id;
  return jsonb_build_object('estorno_id', v_id, 'valor', v_valor, 'cobranca_id', d.gateway_cobranca_id,
                            'total', d.valor_total, 'integral', v_valor >= d.valor_total);
end $$;

-- Resultado do gateway (service role, chamado pela edge function vale-estornar).
create or replace function public.fn_vale_estorno_concluir(p_estorno uuid, p_ok boolean, p_gateway_id text, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
declare e vale_estornos%rowtype; d vale_pedidos%rowtype;
begin
  select * into e from vale_estornos where id = p_estorno for update;
  if e.id is null or e.status <> 'solicitado' then return; end if;
  update vale_estornos set status = case when p_ok then 'concluido' else 'falhou' end, gateway_estorno_id = p_gateway_id,
         resposta = left(p_resposta, 1000) where id = e.id;
  if not p_ok then return; end if;
  update vale_codigos set status = 'estornado', atualizado_em = now() where id = any (e.codigos);
  select * into d from vale_pedidos where id = e.pedido_id for update;
  -- o lote volta para a venda só se o vale estornado não foi usado
  update vale_produtos pr set lote_vendido = greatest(pr.lote_vendido - x.n, 0), atualizado_em = now()
    from (select k.produto_id, count(*) n from vale_codigos k where k.id = any (e.codigos)
            and not exists (select 1 from vale_resgates r where r.codigo_id = k.id and r.desfeito_em is null) group by 1) x
   where pr.id = x.produto_id;
  if d.status = 'pago_sem_lote' or not exists (select 1 from vale_codigos where pedido_id = d.id and status <> 'estornado') then
    update vale_pedidos set status = 'estornado', atualizado_em = now() where id = d.id;
  end if;
end $$;

-- ───────────────────────── permissões das funções ─────────────────────────

revoke all on function public.fn_vale_cpf_valido(text), public.fn_vale_hoje(), public.fn_vale_nome_curto(text), public.fn_vale_token(integer),
  public.fn_vale_novo_codigo(), public.fn_vale_pode(boolean), public.fn_vale_usuario_nome(), public.fn_vale_situacao_venda(),
  public.fn_vale_status_exibido(text, date), public.fn_vale_happy_hour_agora(), public.fn_vale_vitrine(), public.fn_vale_regulamento(),
  public.fn_vale_reservar(jsonb), public.fn_vale_encerrar_pedido(uuid, text), public.fn_vale_cobranca_gravar(uuid, jsonb),
  public.fn_vale_confirmar_pagamento(text, timestamptz, numeric), public.fn_vale_expirar_reservas(), public.fn_vale_pedido_interno(text),
  public.fn_vale_codigo_json(uuid), public.fn_vale_pedido_publico(text), public.fn_vale_consultar(text, text),
  public.fn_vale_resgate_ler(text), public.fn_vale_resgatar(text, jsonb, numeric, text, boolean, boolean), public.fn_vale_resgate_desfazer(uuid),
  public.fn_vale_admin_dados(), public.fn_vale_admin_campanha_salvar(jsonb), public.fn_vale_admin_produto_salvar(jsonb),
  public.fn_vale_admin_pedidos(text, text, integer), public.fn_vale_admin_painel(), public.fn_vale_estorno_preparar(uuid, uuid[], text),
  public.fn_vale_estorno_concluir(uuid, boolean, text, text)
  from public, anon, authenticated;

-- públicas (página /vale)
grant execute on function public.fn_vale_vitrine(), public.fn_vale_regulamento(), public.fn_vale_pedido_publico(text),
  public.fn_vale_consultar(text, text) to anon, authenticated;
-- internas (login + permissão conferida dentro de cada função)
grant execute on function public.fn_vale_pode(boolean), public.fn_vale_resgate_ler(text),
  public.fn_vale_resgatar(text, jsonb, numeric, text, boolean, boolean), public.fn_vale_resgate_desfazer(uuid),
  public.fn_vale_admin_dados(), public.fn_vale_admin_campanha_salvar(jsonb), public.fn_vale_admin_produto_salvar(jsonb),
  public.fn_vale_admin_pedidos(text, text, integer), public.fn_vale_admin_painel(), public.fn_vale_estorno_preparar(uuid, uuid[], text)
  to authenticated;
-- só edge functions (service role)
grant execute on function public.fn_vale_reservar(jsonb), public.fn_vale_encerrar_pedido(uuid, text), public.fn_vale_cobranca_gravar(uuid, jsonb),
  public.fn_vale_confirmar_pagamento(text, timestamptz, numeric), public.fn_vale_expirar_reservas(), public.fn_vale_pedido_interno(text),
  public.fn_vale_estorno_concluir(uuid, boolean, text, text), public.fn_vale_vitrine(), public.fn_vale_pedido_publico(text)
  to service_role;

-- ───────────────────────── robô, módulo e fotos ─────────────────────────

select cron.schedule('vale-expirar-reservas', '*/5 * * * *', $$select public.fn_vale_expirar_reservas()$$);

insert into public.modulos_sistema (nome, slug, icone, cor, ordem, ativo)
select 'Vale Ditado', 'vales', 'Ticket', 'from-amber-600 to-orange-700', 15, true
 where not exists (select 1 from public.modulos_sistema where slug = 'vales');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vale-fotos', 'vale-fotos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy vale_fotos_gerente_insere on storage.objects for insert to authenticated
  with check (bucket_id = 'vale-fotos' and public.fn_vale_pode(true));
create policy vale_fotos_gerente_altera on storage.objects for update to authenticated
  using (bucket_id = 'vale-fotos' and public.fn_vale_pode(true));
create policy vale_fotos_gerente_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'vale-fotos' and public.fn_vale_pode(true));

-- ───────────────────────── seed (docs/PRD-vale-ditado.md seção 3 + copy-pagina.md S4) ─────────────────────────

insert into public.vale_campanha (id, fase, ativo, modo_teste, venda_inicio, venda_fim, validade_meses,
  brinde_descricao, brinde_ate, brinde_valor_cardapio, mostrar_contador, contador_fim, textos)
values (1, 'black', false, true, '2026-11-27 00:00:00-04', '2026-12-24 23:59:59-04', 6,
  'Dupla de Bolinho de Costela', '2026-11-30 23:59:59-04', 18.00, true, '2026-11-30 23:59:59-04',
  jsonb_build_object('whatsapp', '556541413655'));

-- Preço de cardápio por item (base dos 10% proporcionais): chopp R$ 18,50; o resto do "de" dividido entre os pratos
-- (aproximado: ajustar no admin).
with p (ordem, slug, nome, composicao, selo, de, por, tipo, credito, alcool, trava, lote, categoria, db, dn) as (values
  (1,  'cartela-5',         'Cartela 5 Chopps',      '5 chopps Brahma 300 ml. Dois hoje, três no sábado.',                          'Use em várias visitas', 92.50, 64.90,  'kit', null::numeric, true,  true,  100, 'chopp',   1::smallint, null::smallint),
  (2,  'cartela-10',        'Cartela 10 Chopps',     '10 chopps Brahma 300 ml, aos poucos, em 6 meses.',                            'Use em várias visitas', 185.00, 129.90, 'kit', null, true,  true,  50,  'chopp',   null, 2),
  (3,  'kit-boteco',        'Kit Boteco',            'Torresmo de rolo, bolinho de costela (8 un) e 6 chopps.',                     'Pra turma',             227.00, 159.90, 'kit', null, true,  true,  60,  'kits',    2, 3),
  (4,  'abre-a-brasa',      'Abre a Brasa',          'Linguiça portuguesa na massa, queijo coalho com mel, pão de alho e 4 chopps.', 'Começo de conversa',    184.00, 129.90, 'kit', null, true,  true,  60,  'kits',    null, null),
  (5,  'kit-passarinho',    'Kit Passarinho',        'Frango a passarinho, fritas 500 g e 4 chopps.',                               'Clássico de boteco',    168.00, 119.90, 'kit', null, true,  true,  50,  'kits',    null, null),
  (6,  'tabua-chopp',       'Tábua & Chopp',         'Tábua de frios Ditado e 4 chopps.',                                           'Pra beliscar',          203.90, 149.90, 'kit', null, true,  true,  40,  'kits',    null, null),
  (7,  'kit-picanha',       'Kit Picanha',           'Picanha acebolada 400 g e 4 chopps.',                                         'Da brasa',              193.00, 139.90, 'kit', null, true,  true,  40,  'kits',    null, null),
  (8,  'assado-do-ze',      'Assado do Zé',          'Coxa e sobrecoxa desossada na brasa, para 2, e 4 chopps.',                    'Pra 2',                 163.00, 119.90, 'kit', null, true,  true,  30,  'kits',    null, null),
  (9,  'role-de-gin',       'Rolê de Gin',           '4 gin tônica.',                                                               'Drinks da casa',        116.00, 79.90,  'kit', null, true,  false, 50,  'drinks',  null, null),
  (10, 'rodada-caipirinha', 'Rodada de Caipirinha',  '4 caipirinhas de 500 ml.',                                                    'Drinks da casa',        151.60, 99.90,  'kit', null, true,  false, 40,  'drinks',  null, null),
  (11, 'familia',           'Família no Ditado',     'Picanha na chapa com cascata de queijo e 4 refrigerantes.',                   'Sem álcool',            196.00, 159.90, 'kit', null, false, false, 30,  'familia', null, null),
  (12, 'vale-100',          'Vale Ditado 100',       'Paga R$ 100, consome R$ 125 no cardápio.',                                    'Ganha R$ 25',           125.00, 100.00, 'credito', 125.00, false, false, 100, 'credito', 3, null),
  (13, 'vale-200',          'Vale Ditado 200',       'Paga R$ 200, consome R$ 250 no cardápio.',                                    'Ganha R$ 50',           250.00, 200.00, 'credito', 250.00, false, false, 50,  'credito', null, 1))
insert into public.vale_produtos (slug, nome, composicao_texto, selo_tematico, preco_de, preco_por, tipo, credito_valor, tem_alcool,
  trava_happy_hour, lote_total, limite_por_cpf, ordem, categoria, destaque_black, destaque_natal)
select slug, nome, composicao, selo, de, por, tipo, credito, alcool, trava, lote, 2, ordem, categoria, db, dn from p;

with i (slug, ordem, descricao, qtd, alcool, valor) as (values
  ('cartela-5', 1, 'Chopp Brahma 300 ml', 5, true, 18.50),
  ('cartela-10', 1, 'Chopp Brahma 300 ml', 10, true, 18.50),
  ('kit-boteco', 1, 'Torresmo de Rolo', 1, false, 58.00),
  ('kit-boteco', 2, 'Bolinho de Costela (8 un)', 1, false, 58.00),
  ('kit-boteco', 3, 'Chopp Brahma 300 ml', 6, true, 18.50),
  ('abre-a-brasa', 1, 'Linguiça Portuguesa na Massa', 1, false, 36.67),
  ('abre-a-brasa', 2, 'Queijo Coalho com Mel', 1, false, 36.67),
  ('abre-a-brasa', 3, 'Pão de Alho', 1, false, 36.66),
  ('abre-a-brasa', 4, 'Chopp Brahma 300 ml', 4, true, 18.50),
  ('kit-passarinho', 1, 'Frango a Passarinho', 1, false, 47.00),
  ('kit-passarinho', 2, 'Fritas 500 g', 1, false, 47.00),
  ('kit-passarinho', 3, 'Chopp Brahma 300 ml', 4, true, 18.50),
  ('tabua-chopp', 1, 'Tábua de Frios Ditado', 1, false, 129.90),
  ('tabua-chopp', 2, 'Chopp Brahma 300 ml', 4, true, 18.50),
  ('kit-picanha', 1, 'Picanha Acebolada 400 g', 1, false, 119.00),
  ('kit-picanha', 2, 'Chopp Brahma 300 ml', 4, true, 18.50),
  ('assado-do-ze', 1, 'Coxa e Sobrecoxa Desossada na Brasa (para 2)', 1, false, 89.00),
  ('assado-do-ze', 2, 'Chopp Brahma 300 ml', 4, true, 18.50),
  ('role-de-gin', 1, 'Gin Tônica', 4, true, 29.00),
  ('rodada-caipirinha', 1, 'Caipirinha 500 ml', 4, true, 37.90),
  ('familia', 1, 'Picanha na Chapa com Cascata de Queijo', 1, false, 160.00),
  ('familia', 2, 'Refrigerante', 4, false, 9.00))
insert into public.vale_produto_itens (produto_id, descricao, quantidade, tem_alcool, valor_cardapio, ordem)
select p.id, i.descricao, i.qtd, i.alcool, i.valor, i.ordem from i join public.vale_produtos p on p.slug = i.slug;

-- Regulamento: minuta de docs/textos.md (seção 1). Revisar com o advogado; editável no admin.
update public.vale_campanha set regulamento_md = $reg$### REGULAMENTO DA CAMPANHA "MAIS VALE UM DITADO NA MÃO" — Black Brasa e Vale de Natal 2026

**1. Quem vende**
1.1. A campanha é feita por **K M POPULAR BAR LTDA**, CNPJ **12.061.357/0001-69**, nome fantasia Ditado Brasa & Bar, com sede em `[CONFIRMAR: endereço completo]`, Cuiabá-MT.
1.2. Atendimento: WhatsApp **(65) 4141-3655**, e-mail `[CONFIRMAR]`, de `[CONFIRMAR: dias e horário de atendimento]`. Respondemos em até `[CONFIRMAR: 1 dia útil]`.
1.3. Venda exclusiva pela página `[CONFIRMAR: endereço da página]`, em duas fases, com os mesmos produtos e preços:
- **Black Brasa:** de 27/11/2026, a partir de `[CONFIRMAR: hora]`, até 30/11/2026;
- **Vale de Natal:** de 01/12/2026 até 24/12/2026, às `[CONFIRMAR: hora]`;
ou até acabar o lote de cada produto, o que vier primeiro.

**2. Os produtos**
2.1. O comprador paga o valor abaixo e recebe os itens descritos, para resgatar no Ditado Brasa & Bar:

| Produto | O que dá direito | Preço de cardápio | Preço do vale | Lote |
|---|---|---|---|---|
| Abre a Brasa | 1 Linguiça Portuguesa na Massa + 1 Queijo Coalho com Mel + 1 Pão de Alho + 4 Chopps Brahma 300 ml | R$ 184,00 | **R$ 129,90** | 60 |
| Cartela 5 Chopps | 5 Chopps Brahma 300 ml | R$ 92,50 | **R$ 64,90** | 100 |
| Cartela 10 Chopps | 10 Chopps Brahma 300 ml | R$ 185,00 | **R$ 129,90** | 50 |
| Kit Boteco | 1 Torresmo de Rolo + 1 Bolinho de Costela (8 un) + 6 Chopps Brahma 300 ml | R$ 227,00 | **R$ 159,90** | 60 |
| Kit Passarinho | 1 Frango a Passarinho + 1 Fritas 500 g + 4 Chopps Brahma 300 ml | R$ 168,00 | **R$ 119,90** | 50 |
| Kit Picanha | 1 Picanha Acebolada 400 g + 4 Chopps Brahma 300 ml | R$ 193,00 | **R$ 139,90** | 40 |
| Tábua & Chopp | 1 Tábua de Frios Ditado + 4 Chopps Brahma 300 ml | R$ 203,90 | **R$ 149,90** | 40 |
| Assado do Zé | 1 Coxa e Sobrecoxa Desossada na Brasa (para 2) + 4 Chopps Brahma 300 ml | R$ 163,00 | **R$ 119,90** | 30 |
| Rolê de Gin | 4 Gin Tônica | R$ 116,00 | **R$ 79,90** | 50 |
| Rodada de Caipirinha | 4 Caipirinhas 500 ml | R$ 151,60 | **R$ 99,90** | 40 |
| Família no Ditado | 1 Picanha na Chapa com Cascata de Queijo + 4 Refrigerantes | R$ 196,00 | **R$ 159,90** | 30 |
| Vale Ditado 100 | R$ 125,00 de crédito em consumo | R$ 125,00 | **R$ 100,00** | 100 |
| Vale Ditado 200 | R$ 250,00 de crédito em consumo | R$ 250,00 | **R$ 200,00** | 50 |

2.2. **Vales Ditado 100 e 200:** o crédito pode ser usado em comida e bebida do cardápio, **exceto** garrafas (de bebida) e itens vendidos em outras promoções.
2.3. Os itens dos kits e cartelas não podem ser trocados por outros produtos nem por dinheiro, salvo nos casos dos itens 9 e 10.
2.4. Os vales não dão troco. Se o consumo passar do crédito, a diferença é paga normalmente na hora.
2.5. A página mostra quantas unidades restam de cada produto.

**3. Limite por pessoa**
3.1. Cada CPF pode comprar **até 2 unidades** `[CONFIRMAR: 2 no total ou 2 de cada produto]`.

**4. Taxa de serviço e couvert**
4.1. A taxa de serviço de 10% é opcional `[CONFIRMAR com advogado a redação]` e, quando paga, é **calculada sobre o valor pago pelo vale**, não sobre o preço de cardápio. É cobrada no resgate, proporcional ao que for usado em cada visita. Valor total da taxa por produto:
- Abre a Brasa R$ 12,99 · Cartela 5 R$ 6,49 · Cartela 10 R$ 12,99 · Kit Boteco R$ 15,99 · Kit Passarinho R$ 11,99 · Kit Picanha R$ 13,99 · Tábua & Chopp R$ 14,99 · Assado do Zé R$ 11,99 · Rolê de Gin R$ 7,99 · Rodada de Caipirinha R$ 9,99 · Família no Ditado R$ 15,99.
- Vale Ditado 100 e 200: R$ 0,80 a cada R$ 10,00 de crédito usado (total de R$ 10,00 e R$ 20,00).
4.2. O **couvert artístico** não está incluído e é cobrado à parte nos dias em que houver música com couvert.

**5. Validade**
5.1. Cada vale vale por **6 meses a partir da data da compra**. A data exata de vencimento aparece no vale e no e-mail de confirmação. Exemplo: comprado em 27/11/2026, vence em 27/05/2027.
5.2. `[DEFINIR COM ADVOGADO: o que acontece com o saldo não usado após o vencimento.]`

**6. Dias e horários de uso**
6.1. O vale pode ser usado **em qualquer dia em que o Ditado Brasa & Bar estiver aberto**, durante o horário de funcionamento (`[CONFIRMAR: horário de funcionamento]`).
6.2. Os produtos com chopp (Abre a Brasa, Cartelas 5 e 10, Kit Boteco, Kit Passarinho, Kit Picanha, Tábua & Chopp e Assado do Zé) **não podem ser resgatados durante o happy hour**, que vai até as 21h `[CONFIRMAR: dias do happy hour]`. Depois das 21h, valem normalmente.

**7. Como resgatar (inclusive em mais de uma visita)**
7.1. Na chegada ou na hora de pedir, informe o código do vale ao garçom ou ao caixa e apresente documento oficial com foto do titular.
7.2. O uso pode ser **fracionado**:
- Vales Ditado 100 e 200: o saldo em reais pode ser usado em quantas visitas o titular quiser, dentro da validade.
- Kits, cartelas e rodadas: cada item é um crédito por unidade (ex.: 2 chopps hoje, 3 na semana que vem). Pratos e petiscos são servidos em porção inteira.
7.3. O saldo restante aparece no comprovante de cada resgate e pode ser consultado pelo WhatsApp.
7.4. O titular pode dividir o que resgatar com a mesa, respeitando o item 8.

**8. Maioridade**
8.1. Bebida alcoólica é vendida e servida **somente a maiores de 18 anos** (Lei 8.069/1990, art. 243). Na compra de produto com bebida alcoólica, o comprador informa a data de nascimento e declara ser maior de 18 anos.
8.2. No resgate de qualquer item com álcool, inclusive pelo crédito dos Vales Ditado 100 e 200, o documento oficial com foto é conferido. Sem documento, ou para menor de 18, a bebida alcoólica não é servida. Na mesa, a equipe pode pedir documento de qualquer pessoa.
8.3. Nos kits, se o titular não puder receber as bebidas alcoólicas, a comida continua válida.

**9. Arrependimento e reembolso**
9.1. O comprador pode desistir em até **7 dias corridos** a partir da compra (CDC, art. 49), pelo WhatsApp ou e-mail do item 1.2, e recebe a **devolução integral** do valor pago, pelo mesmo meio de pagamento, em até `[CONFIRMAR]` dias. `[CONFIRMAR com advogado: regra para vale já usado em parte dentro dos 7 dias]`
9.2. Com o pedido de arrependimento, o código é cancelado.

**10. Encerramento ou mudança de endereço**
10.1. Se o Ditado Brasa & Bar encerrar as atividades, ou mudar de endereço, antes do vencimento do vale, o titular recebe **em dinheiro** o valor pago correspondente ao saldo não usado, em até `[CONFIRMAR]` dias. No caso de mudança de endereço, o titular pode escolher entre o reembolso e usar o vale no novo endereço.
10.2. O cálculo do reembolso é proporcional ao valor pago (ex.: Vale Ditado 100 com R$ 50 de saldo devolve R$ 40). `[CONFIRMAR com advogado: proporcional ao pago ou ao crédito]`

**11. Transferência**
11.1. O vale é **nominal**. Na compra, o comprador pode cadastrar o nome e o CPF do presenteado.
11.2. O vale pode ser transferido para outra pessoa, sem custo, a qualquer momento antes do vencimento, pelo WhatsApp do item 1.2, informando nome completo e CPF do novo titular. A partir daí, só o novo titular resgata.

**12. Não acumulação**
12.1. O vale não acumula com nenhuma outra promoção ou desconto da casa (happy hour, chopp promocional, Sexta da Chapa, entre outras). O item resgatado pelo vale não recebe desconto adicional.
12.2. O crédito dos Vales Ditado 100 e 200 não paga itens vendidos em outras promoções nem garrafas.

**13. Perda, uso indevido e fraude**
13.1. Guarde o código. Em caso de perda, o titular pode pedir a reemissão pelo WhatsApp, com confirmação de CPF. Código já resgatado não é reemitido.
13.2. Vale comprado com fraude no pagamento é cancelado.

**14. Nota fiscal**
14.1. A venda e a nota fiscal são feitas pela K M POPULAR BAR LTDA, CNPJ 12.061.357/0001-69. A nota é emitida `[CONFIRMAR COM CONTADOR: na compra, no resgate, ou documento de antecipação na compra + nota no resgate]` e enviada ao e-mail informado.

**15. Privacidade (LGPD — Lei 13.709/2018)**
15.1. **Controladora dos dados:** K M POPULAR BAR LTDA. Contato do encarregado: `[CONFIRMAR: nome/e-mail]`.
15.2. **Dados coletados:** nome, CPF, data de nascimento, e-mail e celular do comprador e, se houver, nome e CPF do presenteado.
15.3. **Para que usamos:** emitir e validar o vale, emitir a nota fiscal, conferir a maioridade e o titular no resgate, prestar atendimento, prevenir fraude e cumprir obrigações legais e fiscais.
15.4. **Com quem compartilhamos:** plataforma de pagamento `[CONFIRMAR]`, sistema de caixa (ZIG), contabilidade e autoridades, quando a lei exigir. Não vendemos dados.
15.5. **Por quanto tempo guardamos:** pelo prazo da campanha e pelo prazo legal fiscal `[CONFIRMAR com contador]`.
15.6. **Seus direitos:** acesso, correção, exclusão, portabilidade e revogação do consentimento, pelo contato do item 15.1.
15.7. **Mensagens de WhatsApp:** só enviamos novidades e ofertas por WhatsApp para quem marcar, separadamente, a caixa de consentimento na compra. **A caixa vem desmarcada e não é condição para comprar.** Para parar de receber, basta responder SAIR.

**16. Disposições finais**
16.1. Dúvidas e casos não previstos: atendimento do item 1.2. Este regulamento fica disponível na página da campanha durante toda a validade dos vales.
16.2. Foro: `[CONFIRMAR com advogado]`.

*Beba com moderação. Proibido para menores de 18 anos.*
$reg$ where id = 1;
