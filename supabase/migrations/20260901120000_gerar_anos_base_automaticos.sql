-- ═══════════════════════════════════════════════════════════════════════════
-- FÉRIAS — anos base surgem sozinhos
--
-- Todo colaborador ativo com data de admissão ganha, automaticamente, um ano
-- base por ano trabalhado (inclusive o que está em andamento), com o prazo
-- de concessão calculado. O RH não precisa criar nada: a tela de Férias chama
-- esta função ao abrir, e ela só cria o que falta.
--
-- Âncora do ciclo: a data de admissão. Exceção: quando o RH já gravou anos
-- base num ciclo diferente (outro dia/mês), respeita-se o ciclo gravado — e
-- um ano base nunca é criado por cima de outro que se sobreponha a ele.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.gerar_anos_base_automaticos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c        record;
  ancora   date;
  primeiro date;
  k        integer;
  ini      date;
  fim      date;
  criados  integer := 0;
begin
  for c in
    select id, data_admissao
      from colaboradores
     where status = 'ativo'
       and data_admissao is not null
  loop
    select min(periodo_aquisitivo_inicio) into primeiro
      from periodos_aquisitivos_ferias
     where colaborador_id = c.id;

    if primeiro is null or to_char(primeiro, 'MM-DD') = to_char(c.data_admissao, 'MM-DD') then
      ancora := c.data_admissao;
    else
      ancora := primeiro;
    end if;

    k := 0;
    loop
      ini := (ancora + make_interval(years => k))::date;
      exit when ini > current_date;
      fim := (ancora + make_interval(years => k + 1) - interval '1 day')::date;

      if not exists (
        select 1
          from periodos_aquisitivos_ferias p
         where p.colaborador_id = c.id
           and daterange(p.periodo_aquisitivo_inicio, p.periodo_aquisitivo_fim, '[]')
               && daterange(ini, fim, '[]')
      ) then
        insert into periodos_aquisitivos_ferias
          (colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
           periodo_concessivo_inicio, periodo_concessivo_fim,
           dias_direito, dias_gozados, status, observacoes)
        values
          (c.id, ini, fim,
           fim + 1, (fim + interval '1 year')::date,
           30, 0, 'pendente',
           'Ano base gerado automaticamente a partir da data de admissão.');
        criados := criados + 1;
      end if;

      k := k + 1;
    end loop;
  end loop;

  perform atualizar_status_periodos_aquisitivos();
  return criados;
end;
$$;

grant execute on function public.gerar_anos_base_automaticos() to authenticated;

-- Primeira rodada, para o sistema já abrir completo.
select gerar_anos_base_automaticos();
