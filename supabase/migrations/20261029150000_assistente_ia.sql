-- Assistente de IA do sistema (o balão "Posso ajudar?" em todas as telas).
-- Começa pelo estoque: a IA monta consultas SQL de leitura e o banco roda com
-- um papel que só enxerga as tabelas de estoque, compras e vendas.
--
-- Segurança:
-- - ia_leitura só tem SELECT nas tabelas abaixo (nada de RH, salários, CPF,
--   financeiro). BYPASSRLS porque o controle é pela lista de tabelas.
-- - fn_ia_consulta roda em transação só de leitura, com tempo limite, e só
--   aceita um SELECT/WITH; recusa chamadas a funções fn_*/pg_* (funções do
--   sistema que poderiam ler outras tabelas).
-- - Só a função assistente-ia (service_role) chama fn_ia_consulta.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ia_leitura') then
    create role ia_leitura nologin bypassrls;
  end if;
end $$;
grant usage on schema public to ia_leitura;
grant ia_leitura to service_role;

grant select on
  public.itens_estoque, public.itens_estoque_niveis, public.estoques, public.saldos_estoque, public.movimentacoes_estoque,
  public.entradas_compras, public.itens_entrada_compra, public.fornecedores,
  public.contagens_estoque, public.contagens_estoque_itens, public.contagens_estoque_ajustes,
  public.fichas_tecnicas, public.ficha_ingredientes, public.mapeamento_itens_vendas,
  public.requisicoes_internas, public.requisicoes_internas_itens, public.listas_compra, public.listas_compra_itens,
  public.emprestimos_vizinhos, public.vizinhos, public.setores, public.zig_vendas_sync_logs, public.kds_pratos
to ia_leitura;

-- Quem lançou: só o nome, sem e-mail nem dados do cadastro.
create or replace view public.vw_ia_pessoas as select id, nome_completo as nome from public.usuarios_sistema;
revoke all on public.vw_ia_pessoas from public, anon, authenticated;
grant select on public.vw_ia_pessoas to ia_leitura;

create or replace function public.fn_ia_consulta(p_sql text, p_limite integer default 200)
returns jsonb
language plpgsql
as $function$
declare
  v_sql text := trim(both from regexp_replace(coalesce(p_sql, ''), ';\s*$', ''));
  v_res jsonb;
begin
  if v_sql !~* '^\s*(select|with)\s' then
    raise exception 'Só consultas de leitura (SELECT ou WITH).';
  end if;
  if v_sql ~ ';' then
    raise exception 'Uma consulta por vez, sem ponto e vírgula.';
  end if;
  if v_sql ~* '\m(fn_[a-z0-9_]*|pg_[a-z0-9_]*|set_config|dblink[a-z_]*|lo_[a-z_]+|current_setting)\s*\(' then
    raise exception 'Funções do sistema não podem ser usadas nas consultas.';
  end if;
  execute 'set local transaction_read_only = on';
  execute 'set local statement_timeout = 8000';
  execute 'set local role ia_leitura';
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit %s) t', v_sql, greatest(1, least(coalesce(p_limite, 200), 500)))
    into v_res;
  return v_res;
end
$function$;
revoke execute on function public.fn_ia_consulta(text, integer) from public, anon, authenticated;
grant execute on function public.fn_ia_consulta(text, integer) to service_role;

-- O que foi perguntado e respondido (auditoria e custo).
create table if not exists public.ia_conversas (
  id bigserial primary key,
  usuario_id uuid,
  usuario_nome text,
  modulo text,
  tela text,
  pergunta text not null,
  resposta text,
  consultas jsonb not null default '[]',
  uso jsonb,
  erro text,
  criado_em timestamptz not null default now()
);
alter table public.ia_conversas enable row level security;
