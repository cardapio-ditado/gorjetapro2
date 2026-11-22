-- Aba "Pagamentos" dentro dos módulos de Extras e de Músicos (Kadu, 22/11/2026):
-- extrato das baixas que o Cristiano dá no módulo, com a conferência no financeiro
-- (conta da diária/do show) e no banco (Pix da Stone). SOMENTE LEITURA.
-- Fora: os "saldos iniciais" da implantação (tipo = 'saldo_inicial').
drop function if exists public.fn_extrato_pagamentos(text, date, date);
create function public.fn_extrato_pagamentos(p_modulo text, p_de date, p_ate date)
returns table (
  id uuid, grupo uuid, data_pagamento date, valor numeric, valor_grupo numeric, forma text, observacao text,
  lancado_por text, lancado_em timestamptz, estornado_em timestamptz, estornado_por text, motivo_estorno text,
  quem text, quem_pix text, ref_data date, ref_texto text, ref_valor numeric,
  fin_status text, fin_saldo numeric,
  banco text, banco_data date, banco_valor numeric, banco_nome text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ok boolean;
  v_ini_banco date;
  v_fim_banco date;
begin
  if p_modulo not in ('extras', 'musicos') then raise exception 'módulo inválido'; end if;
  select coalesce((
    select u.ativo and (u.nivel in ('master', 'admin') or exists (
      select 1 from permissoes_usuario pu join modulos_sistema m on m.id = pu.modulo_id
       where pu.usuario_id = u.id and m.slug = p_modulo and pu.aba_id is null and pu.pode_visualizar))
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false) into v_ok;
  if not v_ok then raise exception 'sem acesso'; end if;

  select min(b.data), max(b.data) into v_ini_banco, v_fim_banco from banco_extrato b;

  return query
  with pag as (
    select ep.id, coalesce(ep.lote, ep.id) grupo, ep.data_pagamento, ep.valor, ep.forma, ep.observacao,
           ep.criado_por_nome, ep.criado_em, ep.estornado_em, ep.estornado_por_nome, ep.motivo_estorno,
           coalesce(pp.nome, btrim(e.nome)) quem, fo.nome quem_pix,
           e.data_trabalho ref_data,
           concat_ws(' · ', 'Diária ' || to_char(e.data_trabalho, 'DD/MM'), nullif(btrim(e.funcao_temporaria), '')) ref_texto,
           e.valor_diaria ref_valor, c.status fin_status, c.saldo_restante fin_saldo
      from extras_pagamentos ep
      join extras_freelancers e on e.id = ep.extra_id
      left join extras_pessoas p0 on p0.id = e.pessoa_id
      left join extras_pessoas pp on pp.id = coalesce(p0.juntado_com, p0.id)
      left join fornecedores fo on fo.id = pp.fornecedor_id
      left join contas_pagar c on c.id = e.conta_pagar_id
     where p_modulo = 'extras' and ep.tipo = 'pagamento' and ep.data_pagamento between p_de and p_ate
    union all
    select mp.id, coalesce(mp.lote, mp.id), mp.data_pagamento, mp.valor, mp.forma, mp.observacao,
           mp.criado_por_nome, mp.criado_em, mp.estornado_em, mp.estornado_por_nome, mp.motivo_estorno,
           btrim(m.nome), fo.nome,
           m.data_evento::date,
           'Show ' || to_char(m.data_evento, 'DD/MM'),
           m.valor_total_final,
           (select c.status from contas_pagar c where c.origem_modulo = 'musicos' and c.origem_id = m.id order by c.criado_em desc limit 1),
           (select c.saldo_restante from contas_pagar c where c.origem_modulo = 'musicos' and c.origem_id = m.id order by c.criado_em desc limit 1)
      from musicos_pagamentos mp
      join musicos m on m.id = mp.musico_id
      left join fornecedores fo on fo.id = m.fornecedor_id
     where p_modulo = 'musicos' and mp.tipo = 'pagamento' and mp.data_pagamento between p_de and p_ate
  ),
  grp as (
    select g.grupo, sum(g.valor) filter (where g.estornado_em is null) v, min(g.data_pagamento) d,
           min(g.forma) forma, min(lower(unaccent(coalesce(g.quem_pix, g.quem)))) n1, min(lower(unaccent(g.quem))) n2
      from pag g group by g.grupo
  ),
  ban as (
    -- Pix do extrato do banco que casa com o grupo: mesmo valor, até 3 dias antes/depois e nome
    -- parecido. Músico recebe no nome do integrante ("Nando Siqueira" -> "Fernando Siqueira
    -- Pereira"): vale também uma palavra de 5+ letras do nome do show/cadastro no nome do Pix.
    -- O nome de quem recebeu aparece na tela, para a pessoa conferir.
    select distinct on (gr.grupo) gr.grupo, b.data, abs(b.valor) v, btrim(regexp_replace(coalesce(b.contraparte_nome, ''), '^[0-9. ]+', '')) nome
      from grp gr join banco_extrato b
        on b.sentido = 'debito' and abs(abs(b.valor) - gr.v) < 0.01 and b.data between gr.d - 3 and gr.d + 3
       and (similarity(lower(unaccent(coalesce(b.contraparte_nome, ''))), gr.n1) >= 0.35
         or similarity(lower(unaccent(coalesce(b.contraparte_nome, ''))), gr.n2) >= 0.35
         or split_part(btrim(gr.n1), ' ', 1) = split_part(btrim(lower(unaccent(regexp_replace(coalesce(b.contraparte_nome, ''), '^[0-9. ]+', '')))), ' ', 1)
         or exists (select 1 from unnest(string_to_array(regexp_replace(gr.n1 || ' ' || gr.n2, '[^a-z ]', ' ', 'g'), ' ')) w
                     where length(w) >= 5 and w not in ('grupo', 'projeto', 'banda', 'musico', 'musicos', 'brutos', 'trio', 'duo')
                       and lower(unaccent(coalesce(b.contraparte_nome, ''))) ~ ('\m' || w || '\M')))
     order by gr.grupo, abs(b.data - gr.d)
  )
  select g.id, g.grupo, g.data_pagamento, g.valor, gr.v, g.forma, g.observacao,
         g.criado_por_nome, g.criado_em, g.estornado_em, g.estornado_por_nome, g.motivo_estorno,
         g.quem, g.quem_pix, g.ref_data, g.ref_texto, g.ref_valor, g.fin_status, g.fin_saldo,
         case when g.estornado_em is not null then 'estornado'
              when upper(coalesce(g.forma, '')) <> 'PIX' then 'nao_se_aplica'
              when ba.grupo is not null then 'achado'
              when v_ini_banco is null or g.data_pagamento < v_ini_banco or g.data_pagamento > v_fim_banco - 1 then 'sem_extrato'
              else 'nao_achado' end,
         ba.data, ba.v, ba.nome
    from pag g join grp gr on gr.grupo = g.grupo left join ban ba on ba.grupo = g.grupo
   order by g.data_pagamento desc, g.criado_em desc, g.grupo, g.ref_data;
end $$;

revoke all on function public.fn_extrato_pagamentos(text, date, date) from public, anon;
grant execute on function public.fn_extrato_pagamentos(text, date, date) to authenticated;
