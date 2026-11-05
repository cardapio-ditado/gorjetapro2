-- Assinatura digital própria dos contratos de eventos (no lugar do gov.br).
--
-- Fluxo: o bar assina primeiro (usuário logado com fn_eventos_pode), o PDF vai
-- para o bucket eventos-contratos em assinaturas/<evento>/, e nasce um link
-- /assinar/<token> de 7 dias para o cliente. Aqui fica só o hash do token.
-- Quem escreve nesta tabela é a edge function contrato-assinatura (service
-- role); o front só lê. anon não tem acesso nenhum.
--
-- Trava: depois de assinado, nem a assinatura nem o contrato mudam, e o
-- arquivo assinado não pode ser sobrescrito nem apagado pelo front.

create table if not exists public.eventos_assinaturas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos_contratos(evento_id) on delete cascade,
  status text not null default 'aguardando' check (status in ('aguardando', 'assinado', 'cancelado')),
  token_hash text not null unique,
  expira_em timestamptz not null,
  pdf_original text not null,
  pdf_original_sha256 text not null,
  bar_usuario_id uuid not null,
  bar_nome text not null,
  bar_em timestamptz not null default now(),
  bar_ip text,
  bar_navegador text,
  bar_assinatura text not null,
  cliente_nome text,
  cliente_em timestamptz,
  cliente_ip text,
  cliente_navegador text,
  cliente_assinatura text,
  pdf_assinado text,
  pdf_assinado_sha256 text,
  criado_em timestamptz not null default now()
);

create index if not exists eventos_assinaturas_evento on public.eventos_assinaturas (evento_id, criado_em desc);
create unique index if not exists eventos_assinaturas_um_aguardando on public.eventos_assinaturas (evento_id) where status = 'aguardando';
create unique index if not exists eventos_assinaturas_um_assinado on public.eventos_assinaturas (evento_id) where status = 'assinado';

alter table public.eventos_assinaturas enable row level security;
revoke all on public.eventos_assinaturas from anon, authenticated, public;
grant select on public.eventos_assinaturas to authenticated;

drop policy if exists eventos_assinaturas_ler on public.eventos_assinaturas;
create policy eventos_assinaturas_ler on public.eventos_assinaturas
  for select to authenticated
  using (public.fn_eventos_pode());

-- assinatura concluída não muda nem some (vale também para a service role)
create or replace function public.fn_eventos_assinaturas_trava()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status = 'assinado' then
    raise exception 'Contrato já assinado: a assinatura não pode ser alterada nem apagada. Para mudar, faça um contrato novo.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

drop trigger if exists trg_eventos_assinaturas_trava on public.eventos_assinaturas;
create trigger trg_eventos_assinaturas_trava
  before update or delete on public.eventos_assinaturas
  for each row execute function public.fn_eventos_assinaturas_trava();

-- contrato assinado trava; contrato mudado antes da assinatura do cliente
-- cancela o link pendente (o PDF guardado deixou de ser o contrato atual)
-- security definer: quem edita o contrato não tem escrita em eventos_assinaturas
create or replace function public.fn_eventos_contratos_trava()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.assinado_em is not null then
      raise exception 'Contrato já assinado: não pode ser apagado.';
    end if;
    return old;
  end if;
  if old.assinado_em is not null and (
       new.contratante is distinct from old.contratante
    or new.condicoes is distinct from old.condicoes
    or new.modelo is distinct from old.modelo
    or new.assinado_arquivo is distinct from old.assinado_arquivo
    or new.assinado_em is distinct from old.assinado_em) then
    raise exception 'Contrato já assinado: não pode ser alterado. Para mudar, faça um contrato novo.';
  end if;
  if new.contratante is distinct from old.contratante or new.condicoes is distinct from old.condicoes then
    update public.eventos_assinaturas set status = 'cancelado'
     where evento_id = new.evento_id and status = 'aguardando';
  end if;
  return new;
end
$function$;

drop trigger if exists trg_eventos_contratos_trava on public.eventos_contratos;
create trigger trg_eventos_contratos_trava
  before update or delete on public.eventos_contratos
  for each row execute function public.fn_eventos_contratos_trava();

revoke execute on function public.fn_eventos_assinaturas_trava() from public, anon, authenticated;
revoke execute on function public.fn_eventos_contratos_trava() from public, anon, authenticated;

-- arquivos: quem tem eventos lê tudo; em assinaturas/ só a service role grava
drop policy if exists eventos_contratos_arquivos on storage.objects;
drop policy if exists eventos_contratos_arquivos_ler on storage.objects;
drop policy if exists eventos_contratos_arquivos_enviar on storage.objects;
drop policy if exists eventos_contratos_arquivos_mudar on storage.objects;
drop policy if exists eventos_contratos_arquivos_apagar on storage.objects;

create policy eventos_contratos_arquivos_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'eventos-contratos' and public.fn_eventos_pode());
create policy eventos_contratos_arquivos_enviar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'eventos-contratos' and name not like 'assinaturas/%' and public.fn_eventos_pode());
create policy eventos_contratos_arquivos_mudar on storage.objects
  for update to authenticated
  using (bucket_id = 'eventos-contratos' and name not like 'assinaturas/%' and public.fn_eventos_pode())
  with check (bucket_id = 'eventos-contratos' and name not like 'assinaturas/%' and public.fn_eventos_pode());
create policy eventos_contratos_arquivos_apagar on storage.objects
  for delete to authenticated
  using (bucket_id = 'eventos-contratos' and name not like 'assinaturas/%' and public.fn_eventos_pode());
