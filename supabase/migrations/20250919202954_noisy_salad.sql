/*
  # Corrigir constraint UNIQUE para comissões

  1. Verificar UNIQUE existentes
  2. Remover duplicatas por venda_id
  3. Criar UNIQUE constraint em venda_id
*/

-- 1) Verificar se já há UNIQUE (execute separadamente se quiser checar)
-- select i.relname as index_name, string_agg(a.attname, ',') as columns
-- from   pg_class t
-- join   pg_index ix on t.oid = ix.indrelid
-- join   pg_class i on i.oid = ix.indexrelid
-- join   pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
-- where  t.relname = 'comissoes_garcom' and ix.indisunique
-- group  by i.relname
-- order  by i.relname;

-- 2) Remover duplicatas (mantém o mais recente por data_calculo)
with dups as (
  select ctid,
         row_number() over (partition by venda_id
                            order by coalesce(data_calculo, now()) desc) as rn
  from public.comissoes_garcom
)
delete from public.comissoes_garcom c
using dups
where c.ctid = dups.ctid
  and dups.rn > 1;

-- 3) Criar a UNIQUE (e garanta NOT NULL)
alter table public.comissoes_garcom
  alter column venda_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_indexes 
    where schemaname = 'public' 
      and tablename = 'comissoes_garcom' 
      and indexname = 'comissoes_garcom_venda_id_key'
  ) then
    alter table public.comissoes_garcom
      add constraint comissoes_garcom_venda_id_key unique (venda_id);
  end if;
end$$;