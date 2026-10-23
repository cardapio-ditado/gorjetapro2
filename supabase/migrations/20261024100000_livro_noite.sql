-- Livro da Noite: o gerente do turno relata a noite setor por setor, o caixa
-- (dinheiro) e os pagamentos feitos (so informativo: nada daqui vai para o
-- Financeiro). Fechado, o livro nao edita mais: so adendo. Pendencia (ocorrencia
-- que precisa de providencia) continua aparecendo nas noites seguintes.
-- A "noite" de uma data vai ate as 06h do dia seguinte (fuso de Cuiaba).

create or replace function public.fn_livro_data_noite()
returns date language sql stable
as $$ select ((now() at time zone 'America/Cuiaba') - interval '6 hours')::date $$;

-- Quem usa o livro: admin e master (os gerentes do sistema).
create or replace function public.fn_livro_pode()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce((select u.nivel in ('admin', 'master') from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false) $$;

-- Quem reabre livro fechado: os gestores (mesma lista do Portal do Gestor).
create or replace function public.fn_livro_gestor()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(fn_usuario_sistema_id()::text in (
    select jsonb_array_elements_text(coalesce((select valor from configuracoes_sistema where chave = 'portal_gestores'), '[]')::jsonb)), false)
$$;

create table if not exists public.livro_noites (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  gerente_nome text default fn_usuario_nome(),
  movimento text check (movimento in ('fraco', 'medio', 'forte', 'lotado')),
  recado text,
  fundo_troco numeric(12, 2) check (fundo_troco >= 0),
  dinheiro_entrada numeric(12, 2) check (dinheiro_entrada >= 0),
  dinheiro_contado numeric(12, 2) check (dinheiro_contado >= 0),
  caixa_obs text,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  fechado_por_nome text,
  fechado_em timestamptz,
  reaberto_por_nome text,
  reaberto_em timestamptz,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.livro_setores (
  id uuid primary key default gen_random_uuid(),
  noite_id uuid not null references public.livro_noites(id) on delete cascade,
  setor text not null check (setor in ('salao', 'bar', 'cozinha', 'caixa', 'seguranca', 'limpeza', 'estoque', 'manutencao', 'geral')),
  por_nome text default fn_usuario_nome(),
  criado_em timestamptz not null default now(),
  unique (noite_id, setor)
);

create table if not exists public.livro_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  noite_id uuid not null references public.livro_noites(id) on delete cascade,
  setor text not null check (setor in ('salao', 'bar', 'cozinha', 'caixa', 'seguranca', 'limpeza', 'estoque', 'manutencao', 'geral')),
  tipo text not null check (tipo in ('pessoal', 'cliente', 'falta_produto', 'equipamento', 'seguranca', 'elogio', 'outro')),
  gravidade text not null default 'info' check (gravidade in ('info', 'atencao', 'grave')),
  texto text not null check (length(btrim(texto)) > 0),
  envolvidos text,
  fotos text[] not null default '{}',
  precisa_providencia boolean not null default false,
  responsavel text,
  prazo date,
  status_pendencia text not null default 'aberta' check (status_pendencia in ('aberta', 'resolvida')),
  resolvida_em timestamptz,
  resolvida_por_nome text,
  resolucao text,
  criado_por_nome text default fn_usuario_nome(),
  criado_em timestamptz not null default now()
);
create index if not exists livro_ocorrencias_noite on public.livro_ocorrencias (noite_id);
create index if not exists livro_ocorrencias_pendencia on public.livro_ocorrencias (status_pendencia) where precisa_providencia;

create table if not exists public.livro_caixa_movs (
  id uuid primary key default gen_random_uuid(),
  noite_id uuid not null references public.livro_noites(id) on delete cascade,
  tipo text not null check (tipo in ('sangria', 'suprimento')),
  valor numeric(12, 2) not null check (valor > 0),
  motivo text,
  por_nome text default fn_usuario_nome(),
  criado_em timestamptz not null default now()
);

create table if not exists public.livro_pagamentos (
  id uuid primary key default gen_random_uuid(),
  noite_id uuid not null references public.livro_noites(id) on delete cascade,
  descricao text not null check (length(btrim(descricao)) > 0),
  valor numeric(12, 2) not null check (valor > 0),
  forma text not null default 'dinheiro_caixa' check (forma in ('dinheiro_caixa', 'pix', 'outro')),
  autorizado_por text,
  por_nome text default fn_usuario_nome(),
  criado_em timestamptz not null default now()
);

create table if not exists public.livro_presenca (
  id uuid primary key default gen_random_uuid(),
  noite_id uuid not null references public.livro_noites(id) on delete cascade,
  nome text not null,
  situacao text not null check (situacao in ('faltou', 'atrasou', 'saiu_cedo')),
  obs text,
  criado_em timestamptz not null default now(),
  unique (noite_id, nome)
);

create table if not exists public.livro_reservas (
  id uuid primary key default gen_random_uuid(),
  noite_id uuid not null references public.livro_noites(id) on delete cascade,
  referencia text not null,
  situacao text not null check (situacao in ('veio', 'nao_veio')),
  criado_em timestamptz not null default now(),
  unique (noite_id, referencia)
);

create table if not exists public.livro_adendos (
  id uuid primary key default gen_random_uuid(),
  noite_id uuid not null references public.livro_noites(id) on delete cascade,
  texto text not null check (length(btrim(texto)) > 0),
  por_nome text default fn_usuario_nome(),
  criado_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['livro_noites', 'livro_setores', 'livro_ocorrencias', 'livro_caixa_movs', 'livro_pagamentos', 'livro_presenca', 'livro_reservas', 'livro_adendos'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_pode') then
      execute format('create policy %I on public.%I for all to authenticated using (fn_livro_pode()) with check (fn_livro_pode())', t || '_pode', t);
    end if;
  end loop;
end $$;

-- Livro fechado: o que e da noite nao muda mais (so adendo e pendencia).
create or replace function public.fn_livro_travar()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_status text;
begin
  select status into v_status from livro_noites where id = coalesce(new.noite_id, old.noite_id);
  if v_status = 'fechado' then
    raise exception 'O livro desta noite esta fechado. Use um adendo.';
  end if;
  return coalesce(new, old);
end $function$;

do $$
declare t text;
begin
  foreach t in array array['livro_setores', 'livro_caixa_movs', 'livro_pagamentos', 'livro_presenca', 'livro_reservas'] loop
    execute format('create or replace trigger trg_%s_travar before insert or update or delete on public.%I for each row execute function fn_livro_travar()', t, t);
  end loop;
end $$;

create or replace function public.fn_livro_ocorrencia_antes()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_status text;
  v_livres text[] := array['status_pendencia', 'resolvida_em', 'resolvida_por_nome', 'resolucao', 'responsavel', 'prazo'];
begin
  select status into v_status from livro_noites where id = coalesce(new.noite_id, old.noite_id);
  if tg_op = 'INSERT' then
    if v_status = 'fechado' then raise exception 'O livro desta noite esta fechado. Use um adendo.'; end if;
    execute 'del' || 'ete from public.livro_setores where noite_id = $1 and setor = $2' using new.noite_id, new.setor;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if v_status = 'fechado' then raise exception 'O livro desta noite esta fechado. Use um adendo.'; end if;
    return old;
  end if;
  if v_status = 'fechado' and (to_jsonb(new) - v_livres) is distinct from (to_jsonb(old) - v_livres) then
    raise exception 'O livro desta noite esta fechado. Use um adendo.';
  end if;
  if new.status_pendencia = 'resolvida' and old.status_pendencia = 'aberta' then
    new.resolvida_em := now();
    new.resolvida_por_nome := coalesce(fn_usuario_nome(), new.resolvida_por_nome);
  elsif new.status_pendencia = 'aberta' and old.status_pendencia = 'resolvida' then
    new.resolvida_em := null; new.resolvida_por_nome := null;
  end if;
  return new;
end $function$;

create or replace trigger trg_livro_ocorrencias_antes
  before insert or update or delete on public.livro_ocorrencias
  for each row execute function fn_livro_ocorrencia_antes();

-- Fechar e reabrir o livro.
create or replace function public.fn_livro_noites_antes()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_falta text[] := '{}'; s text; r record;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'fechado' and new.status = 'fechado' then
      raise exception 'O livro desta noite esta fechado. Use um adendo.';
    end if;
    if old.status = 'fechado' and new.status = 'aberto' then
      if not fn_livro_gestor() then raise exception 'So o gestor reabre um livro fechado.'; end if;
      new.reaberto_por_nome := fn_usuario_nome(); new.reaberto_em := now(); new.fechado_por_nome := null; new.fechado_em := null;
    end if;
    if old.status = 'aberto' and new.status = 'fechado' then
      for r in select * from (values ('salao', 'Salao'), ('bar', 'Bar'), ('cozinha', 'Cozinha'), ('caixa', 'Caixa e Recepcao'),
                                     ('seguranca', 'Seguranca'), ('limpeza', 'Limpeza'), ('estoque', 'Estoque'),
                                     ('manutencao', 'Manutencao'), ('geral', 'Geral')) v(setor, nome) loop
        if not exists (select 1 from livro_setores where noite_id = new.id and setor = r.setor)
           and not exists (select 1 from livro_ocorrencias where noite_id = new.id and setor = r.setor) then
          v_falta := v_falta || r.nome;
        end if;
      end loop;
      s := '';
      if array_length(v_falta, 1) > 0 then s := 'Setores sem resposta: ' || array_to_string(v_falta, ', ') || '. '; end if;
      if new.movimento is null then s := s || 'Falta o movimento da casa. '; end if;
      if new.fundo_troco is null or new.dinheiro_entrada is null or new.dinheiro_contado is null then
        s := s || 'Falta preencher o caixa (fundo de troco, dinheiro que entrou e dinheiro contado). ';
      end if;
      if s <> '' then raise exception 'Nao da para fechar o livro. %', btrim(s); end if;
      new.fechado_por_nome := fn_usuario_nome(); new.fechado_em := now();
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $function$;

create or replace trigger trg_livro_noites_antes
  before update on public.livro_noites
  for each row execute function fn_livro_noites_antes();

-- Conta do caixa: fundo + entrou + suprimentos - sangrias - pagamentos em dinheiro.
create or replace function public.fn_livro_caixa(p_noite uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'sangrias', coalesce((select sum(valor) from livro_caixa_movs where noite_id = n.id and tipo = 'sangria'), 0),
    'suprimentos', coalesce((select sum(valor) from livro_caixa_movs where noite_id = n.id and tipo = 'suprimento'), 0),
    'pagamentos_dinheiro', coalesce((select sum(valor) from livro_pagamentos where noite_id = n.id and forma = 'dinheiro_caixa'), 0),
    'pagamentos_total', coalesce((select sum(valor) from livro_pagamentos where noite_id = n.id), 0),
    'esperado', case when n.fundo_troco is null or n.dinheiro_entrada is null then null else
      n.fundo_troco + n.dinheiro_entrada
      + coalesce((select sum(valor) from livro_caixa_movs where noite_id = n.id and tipo = 'suprimento'), 0)
      - coalesce((select sum(valor) from livro_caixa_movs where noite_id = n.id and tipo = 'sangria'), 0)
      - coalesce((select sum(valor) from livro_pagamentos where noite_id = n.id and forma = 'dinheiro_caixa'), 0) end,
    'diferenca', case when n.fundo_troco is null or n.dinheiro_entrada is null or n.dinheiro_contado is null then null else
      n.dinheiro_contado - (n.fundo_troco + n.dinheiro_entrada
      + coalesce((select sum(valor) from livro_caixa_movs where noite_id = n.id and tipo = 'suprimento'), 0)
      - coalesce((select sum(valor) from livro_caixa_movs where noite_id = n.id and tipo = 'sangria'), 0)
      - coalesce((select sum(valor) from livro_pagamentos where noite_id = n.id and forma = 'dinheiro_caixa'), 0)) end)
  from livro_noites n where n.id = p_noite
$$;
revoke execute on function public.fn_livro_caixa(uuid) from public, anon, authenticated;

-- Tudo de uma noite numa chamada. p_criar abre o livro se ainda nao existe
-- (ate 7 noites para tras).
create or replace function public.fn_livro_carregar(p_data date, p_criar boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_n livro_noites; v_hoje date := fn_livro_data_noite(); v_id uuid;
begin
  if not fn_livro_pode() then raise exception 'Sem acesso ao Livro da Noite.'; end if;
  select * into v_n from livro_noites where data = p_data;
  if v_n.id is null and p_criar then
    if p_data > v_hoje or p_data < v_hoje - 7 then raise exception 'So da para abrir o livro das ultimas 7 noites.'; end if;
    insert into livro_noites (data) values (p_data) returning * into v_n;
  end if;
  v_id := v_n.id;
  return jsonb_build_object(
    'noite_atual', v_hoje, 'data', p_data, 'gestor', fn_livro_gestor(),
    'noite', case when v_id is null then null else to_jsonb(v_n) end,
    'setores', coalesce((select jsonb_agg(to_jsonb(s) order by s.criado_em) from livro_setores s where s.noite_id = v_id), '[]'::jsonb),
    'ocorrencias', coalesce((select jsonb_agg(to_jsonb(o) order by o.criado_em) from livro_ocorrencias o where o.noite_id = v_id), '[]'::jsonb),
    'caixa_movs', coalesce((select jsonb_agg(to_jsonb(c) order by c.criado_em) from livro_caixa_movs c where c.noite_id = v_id), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(to_jsonb(p) order by p.criado_em) from livro_pagamentos p where p.noite_id = v_id), '[]'::jsonb),
    'presenca', coalesce((select jsonb_agg(to_jsonb(p)) from livro_presenca p where p.noite_id = v_id), '[]'::jsonb),
    'reservas_status', coalesce((select jsonb_agg(to_jsonb(r)) from livro_reservas r where r.noite_id = v_id), '[]'::jsonb),
    'adendos', coalesce((select jsonb_agg(to_jsonb(a) order by a.criado_em) from livro_adendos a where a.noite_id = v_id), '[]'::jsonb),
    'pendencias', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'data', n.data, 'setor', o.setor, 'tipo', o.tipo, 'gravidade', o.gravidade,
               'texto', o.texto, 'responsavel', o.responsavel, 'prazo', o.prazo, 'fotos', o.fotos, 'criado_por_nome', o.criado_por_nome) order by n.data, o.criado_em)
        from livro_ocorrencias o join livro_noites n on n.id = o.noite_id
       where o.precisa_providencia and o.status_pendencia = 'aberta' and n.data < p_data), '[]'::jsonb),
    'caixa', case when v_id is null then null else fn_livro_caixa(v_id) end,
    'portal', fn_portal_gerente_dia(p_data),
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('nome', coalesce(p.nome, f.nome), 'funcao', f.funcao_temporaria, 'setor', f.setor, 'presenca', f.presenca) order by f.setor, f.nome)
        from extras_freelancers f left join extras_pessoas p on p.id = f.pessoa_id where f.data_trabalho = p_data), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('nome', nome_evento, 'pessoas', quantidade_pessoas, 'hora', horario_inicio))
                           from eventos_fechados where data_evento = p_data), '[]'::jsonb),
    'zig_total', (select total from faturamento_zig_diario where data = p_data)
  );
end $function$;
revoke execute on function public.fn_livro_carregar(date, boolean) from public, anon;
grant execute on function public.fn_livro_carregar(date, boolean) to authenticated;

-- Historico: uma linha por noite, com busca (texto das ocorrencias, recado e pagamentos).
create or replace function public.fn_livro_lista(p_de date, p_ate date, p_busca text default null)
returns table (data date, status text, gerente_nome text, movimento text, ocorrencias int, graves int, pendencias_abertas int,
               dinheiro_entrada numeric, diferenca numeric, pagamentos_total numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_b text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  if not fn_livro_pode() then raise exception 'Sem acesso ao Livro da Noite.'; end if;
  return query
  select n.data, n.status, n.gerente_nome, n.movimento,
         (select count(*)::int from livro_ocorrencias o where o.noite_id = n.id),
         (select count(*)::int from livro_ocorrencias o where o.noite_id = n.id and o.gravidade = 'grave'),
         (select count(*)::int from livro_ocorrencias o where o.noite_id = n.id and o.precisa_providencia and o.status_pendencia = 'aberta'),
         n.dinheiro_entrada,
         (fn_livro_caixa(n.id) ->> 'diferenca')::numeric,
         (fn_livro_caixa(n.id) ->> 'pagamentos_total')::numeric
    from livro_noites n
   where n.data between p_de and p_ate
     and (v_b is null
          or n.recado ilike '%' || v_b || '%' or n.caixa_obs ilike '%' || v_b || '%'
          or exists (select 1 from livro_ocorrencias o where o.noite_id = n.id and (o.texto ilike '%' || v_b || '%' or o.envolvidos ilike '%' || v_b || '%' or o.setor ilike '%' || v_b || '%'))
          or exists (select 1 from livro_pagamentos p where p.noite_id = n.id and p.descricao ilike '%' || v_b || '%'))
   order by n.data desc;
end $function$;
revoke execute on function public.fn_livro_lista(date, date, text) from public, anon;
grant execute on function public.fn_livro_lista(date, date, text) to authenticated;

-- Resumo para o Portal do Gestor.
create or replace function public.fn_livro_resumo()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_hoje date := fn_livro_data_noite(); v_ant date := fn_livro_data_noite() - 1; n livro_noites; v_agora timestamp := now() at time zone 'America/Cuiaba';
        v_vendeu boolean; v_atrasado boolean;
begin
  select * into n from livro_noites where data = v_ant;
  select coalesce((select total > 0 from faturamento_zig_diario where data = v_ant), false) into v_vendeu;
  v_atrasado := v_agora >= (v_ant + 1)::timestamp + interval '11 hours'
                and ((n.id is not null and n.status = 'aberto') or (n.id is null and v_vendeu));
  return jsonb_build_object(
    'noite', v_hoje,
    'anterior', jsonb_build_object(
      'data', v_ant, 'existe', n.id is not null, 'status', n.status, 'gerente', n.gerente_nome, 'movimento', n.movimento,
      'dinheiro_entrada', n.dinheiro_entrada,
      'diferenca', case when n.id is null then null else fn_livro_caixa(n.id) -> 'diferenca' end,
      'pagamentos_total', case when n.id is null then null else fn_livro_caixa(n.id) -> 'pagamentos_total' end,
      'ocorrencias', coalesce((select count(*) from livro_ocorrencias o where o.noite_id = n.id), 0),
      'graves', coalesce((select count(*) from livro_ocorrencias o where o.noite_id = n.id and o.gravidade = 'grave'), 0),
      'recado', n.recado),
    'atrasado', v_atrasado,
    'pendencias_abertas', (select count(*) from livro_ocorrencias o where o.precisa_providencia and o.status_pendencia = 'aberta'),
    'pendencias_vencidas', (select count(*) from livro_ocorrencias o where o.precisa_providencia and o.status_pendencia = 'aberta' and o.prazo < (v_agora)::date));
end $function$;
revoke execute on function public.fn_livro_resumo() from public, anon;
grant execute on function public.fn_livro_resumo() to authenticated;

-- Fotos das ocorrencias: pasta privada (link assinado na tela).
insert into storage.buckets (id, name, public) values ('livro', 'livro', false) on conflict (id) do nothing;
create policy livro_fotos_ler on storage.objects for select to authenticated using (bucket_id = 'livro' and fn_livro_pode());
create policy livro_fotos_subir on storage.objects for insert to authenticated with check (bucket_id = 'livro' and fn_livro_pode());

-- Modulo e acesso: admin e master.
insert into public.modulos_sistema (nome, slug, icone, cor, ordem, ativo)
select 'Livro da Noite', 'livro', 'BookOpen', 'from-slate-600 to-slate-800', 11, true
where not exists (select 1 from public.modulos_sistema where slug = 'livro');

insert into public.permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
select u.id, (select id from public.modulos_sistema where slug = 'livro'), null, true, true, true, false, false
  from public.usuarios_sistema u
 where u.ativo and u.nivel in ('admin', 'master')
   and not exists (select 1 from public.permissoes_usuario x where x.usuario_id = u.id
                     and x.modulo_id = (select id from public.modulos_sistema where slug = 'livro') and x.aba_id is null);
