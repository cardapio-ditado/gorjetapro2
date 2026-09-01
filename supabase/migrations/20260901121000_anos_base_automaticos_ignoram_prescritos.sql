-- Férias vencidas há mais de 5 anos estão prescritas (CF art. 7º, XXIX): não
-- há o que cobrar nem conceder. Gerar esses anos só criaria "vencidos" de
-- 2012 que ninguém pode resolver. A função pula anos cujo prazo terminou há
-- mais de 5 anos, e as linhas que a primeira rodada criou nessa condição
-- (sem nenhuma férias vinculada) são removidas.

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
      k := k + 1;

      -- prazo de concessão encerrado há mais de 5 anos: prescrito, não gera
      continue when (fim + interval '1 year')::date < (current_date - interval '5 years')::date;

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
    end loop;
  end loop;

  perform atualizar_status_periodos_aquisitivos();
  return criados;
end;
$$;

delete from periodos_aquisitivos_ferias p
 where p.observacoes = 'Ano base gerado automaticamente a partir da data de admissão.'
   and p.periodo_concessivo_fim < (current_date - interval '5 years')::date
   and not exists (select 1 from ferias_colaboradores f where f.periodo_aquisitivo_id = p.id);
