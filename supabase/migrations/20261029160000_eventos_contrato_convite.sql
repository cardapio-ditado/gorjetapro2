-- Contrato e convite dos eventos fechados (por enquanto o modelo da feijoada).
--
-- Os dados do contratante (CPF/CNPJ, endereço) ficam numa tabela à parte, só
-- para quem tem o módulo de eventos: eventos_fechados é aberta para anon.
--   contratante  nome, documento, logradouro, numero, complemento, bairro, cep,
--                cidade, uf, representante
--   condicoes    valor_pessoa, minimo, maximo, prazo_pagamento_dias,
--                buffet_inicio/fim, banda_inicio/fim, clausula_extra
--   convite      layout, titulo, chamada, logo_cliente (url pública), mostrar_preco
-- O contrato assinado (PDF do gov.br) vai para o bucket privado eventos-contratos.

create or replace function public.fn_eventos_pode()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select u.ativo and (
      u.nivel = 'master'
      or exists (
        select 1 from permissoes_usuario p
          join modulos_sistema m on m.id = p.modulo_id
         where p.usuario_id = u.id and m.slug = 'eventos' and p.aba_id is null and p.pode_visualizar)
    )
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$function$;

revoke execute on function public.fn_eventos_pode() from public, anon;
grant execute on function public.fn_eventos_pode() to authenticated;

create table if not exists public.eventos_contratos (
  evento_id uuid primary key references public.eventos_fechados(id) on delete cascade,
  modelo text not null default 'feijoada',
  contratante jsonb not null default '{}',
  condicoes jsonb not null default '{}',
  convite jsonb not null default '{}',
  gerado_em timestamptz,
  gerado_por text,
  assinado_arquivo text,
  assinado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table public.eventos_contratos enable row level security;
revoke all on public.eventos_contratos from anon;
grant select, insert, update, delete on public.eventos_contratos to authenticated;

create policy eventos_contratos_acesso on public.eventos_contratos
  for all to authenticated
  using (public.fn_eventos_pode())
  with check (public.fn_eventos_pode());

insert into storage.buckets (id, name, public)
values ('eventos-contratos', 'eventos-contratos', false)
on conflict (id) do nothing;

create policy eventos_contratos_arquivos on storage.objects
  for all to authenticated
  using (bucket_id = 'eventos-contratos' and public.fn_eventos_pode())
  with check (bucket_id = 'eventos-contratos' and public.fn_eventos_pode());
