-- Andar Operacional (Central de agentes do Ditado): foto do dia de Extras e Músicos.
-- SOMENTE LEITURA. Cruza o que foi lançado nos módulos (diárias e shows) com os Pix
-- que de fato saíram no financeiro (fluxo_caixa: saídas nas categorias de extras e de cachê).
--
-- Regra (combinada com o Kadu em 05/11/2026):
--   dívida real = lançado (diária/show) − Pix recebido pela pessoa no período,
--   abatendo os Pix das diárias/shows mais antigos para os mais novos (FIFO).
--   Prazo: extra registrado na casa 7 dias, extra de fora 2 dias, músico 7 dias (aplicado na página).
-- Extras: desde 01/08/2026. Músicos: desde 01/01/2026.
-- Vínculo pessoa → quem recebe o Pix: pelo nome (o módulo cria um fornecedor próprio, ex. "Adriel",
-- e a conciliação paga outro, ex. "ADRIEL CAMPOS BRITO"); os dois entram na soma.
-- Músicos: agrupa fornecedores com o mesmo nome normalizado (ex. "NOBATUK" e "GRUPO NOBATUK").
-- Saída: um único JSON (coluna "foto") para gravar no artifact (coleção op, doc foto).
with
par as (select (now() at time zone 'America/Cuiaba')::date hoje, date '2026-08-01' ini_ext, date '2026-01-01' ini_mus),
cat_ext as (select unnest(array['2c6658df-ab7a-4398-9b0e-bc6af11556ee','e39e5a83-fe45-4f3e-a8a2-0a5806f73085',
  'f867b394-d8c5-4e59-aacf-e02f0078fbca','eff211e3-e096-40b8-8854-3b7d1ef888f7','ae5f2dff-2ea4-4b8f-a9e9-7bbe8e3f2906',
  '6f030239-f3df-4ecd-a5c6-2aaa3992669b']::uuid[]) id),
cat_mus as (select '8a0e65eb-e5c1-4ab9-a03c-6103c9071883'::uuid id),
-- todos os Pix (saídas) do período, com quem recebeu
pix as (
  select fc.data, fc.valor, c.fornecedor_id fid,
         case when fc.categoria_id in (select id from cat_mus) then 'mus' else 'ext' end g
  from fluxo_caixa fc join contas_pagar c on c.id = fc.conta_pagar_id
  where fc.tipo = 'saida' and fc.data >= (select ini_mus from par)
    and (fc.categoria_id in (select id from cat_ext) or fc.categoria_id in (select id from cat_mus))),

-- ── EXTRAS ────────────────────────────────────────────────────────────────
pes as (
  select p.id::text pk, p.nome, p.fornecedor_id fid_cad,
         btrim(regexp_replace(lower(unaccent(p.nome)), '^(dona|seu|sr|sra)\s+', '')) n
  from extras_pessoas p where p.juntado_com is null
  union
  select distinct 'n:' || lower(btrim(e.nome)), btrim(e.nome), null::uuid,
         btrim(regexp_replace(lower(unaccent(btrim(e.nome))), '^(dona|seu|sr|sra)\s+', ''))
  from extras_freelancers e where e.pessoa_id is null and e.data_trabalho >= (select ini_ext from par)),
forn_ext as (
  select distinct p.fid id, btrim(lower(unaccent(fo.nome))) n
  from pix p join fornecedores fo on fo.id = p.fid where p.g = 'ext' and p.data >= (select ini_ext - 60 from par)),
cand0 as (  -- nota de parecença: trigramas, ou todas as palavras do nome curto dentro do nome do Pix ("joao braga" ⊂ "joao vitor de oliveira braga")
  select p.pk, f.id fid, greatest(similarity(p.n, f.n), word_similarity(p.n, f.n),
           case when array_length(string_to_array(p.n, ' '), 1) >= 2
                 and (select bool_and(t = any (string_to_array(f.n, ' '))) from unnest(string_to_array(p.n, ' ')) t where length(t) > 2)
                then 0.95 else 0 end) s
  from pes p cross join forn_ext f where f.id is distinct from p.fid_cad),
cand as (select *, row_number() over (partition by pk order by s desc) r from cand0),
vinc as (
  select p.pk, p.fid_cad,
    (select c1.fid from cand c1 where c1.pk = p.pk and c1.r = 1 and c1.s >= 0.6
       and c1.s - coalesce((select c2.s from cand c2 where c2.pk = p.pk and c2.r = 2), 0) >= 0.08) fid_nome
  from pes p),
dia as (
  select e.id, coalesce(pp.id::text, 'n:' || lower(btrim(e.nome))) pk, coalesce(pp.nome, btrim(e.nome)) nome,
         v.fid_nome, v.fid_cad, e.data_trabalho d, e.valor_diaria v, e.funcao_temporaria func, e.pedido_por,
         e.status_pagamento st, e.conta_pagar_id
  from extras_freelancers e
  left join extras_pessoas p0 on p0.id = e.pessoa_id
  left join extras_pessoas pp on pp.id = coalesce(p0.juntado_com, p0.id)
  left join vinc v on v.pk = coalesce(pp.id::text, 'n:' || lower(btrim(e.nome)))
  where e.status_pagamento <> 'cancelado' and coalesce(e.presenca, '') <> 'faltou'
    and e.data_trabalho >= (select ini_ext from par)),
-- chave da pessoa: quem recebe o Pix (junta "Nicholas", "Nhicolas", "Nicholas Araujo")
dia_k as (select *, coalesce(fid_nome::text, fid_cad::text, pk) k from dia),
k_forn as (
  select distinct k, f from (select k, fid_nome f from dia_k union select k, fid_cad from dia_k) x where f is not null),
pix_k as (
  select kf.k, sum(p.valor) pago, count(*) n, max(p.data) ult
  from k_forn kf join pix p on p.fid = kf.f and p.g = 'ext' and p.data >= (select ini_ext from par) group by kf.k),
pass_k as (select * from dia_k where d <= (select hoje from par)),
-- Saldo em aberto respeitando a data: um Pix só paga diária do mesmo dia ou anterior.
-- Saldo final = S_n − min(0, menor S_k) (soma acumulada: +diária, −Pix; no mesmo dia a diária vem antes).
ev_ext as (
  select k, d dt, 0 o, v x from pass_k
  union all
  select kf.k, p.data, 1, -p.valor from k_forn kf join pix p on p.fid = kf.f and p.g = 'ext' and p.data >= (select ini_ext from par)),
cum_ext as (select k, dt, o, sum(x) over (partition by k order by dt, o rows unbounded preceding) s from ev_ext),
bal_ext as (select k, (array_agg(s order by dt desc, o desc))[1] - least(0, min(s)) b from cum_ext group by k),
rev_ext as (select k, d, v, func, pedido_por, sum(v) over (partition by k order by d desc, id desc rows unbounded preceding) rc from pass_k),
ext_aberto as (  -- as diárias mais novas que somam o saldo (os Pix pagam as mais antigas primeiro)
  select r.k, r.d, r.v, r.func, r.pedido_por, least(r.v, b.b - (r.rc - r.v)) aberto
  from rev_ext r join bal_ext b on b.k = r.k where b.b - (r.rc - r.v) > 0.009),
ext_pessoa as (
  select k, (array_agg(nome order by d desc))[1] nome, min(fid_nome::text)::uuid fid_nome,
         count(*) filter (where d <= (select hoje from par)) n, coalesce(sum(v) filter (where d <= (select hoje from par)), 0) devido,
         min(d) filter (where d > (select hoje from par)) prox,
         count(*) filter (where d <= (select hoje from par) and st = 'pendente') pend_mod
  from dia_k group by k),
casa as (
  select ep.k, exists (select 1 from colaboradores co where co.status = 'ativo'
         and greatest(similarity(lower(unaccent(co.nome_completo)), lower(unaccent(coalesce(fo.nome, ep.nome)))),
                      word_similarity(lower(unaccent(coalesce(fo.nome, ep.nome))), lower(unaccent(co.nome_completo)))) >= 0.75) eh_casa
  from ext_pessoa ep left join fornecedores fo on fo.id = ep.fid_nome),
ext_json as (
  select coalesce(json_agg(json_build_object(
      'k', ep.k, 'nome', ep.nome, 'forn', fo.nome, 'casa', ca.eh_casa, 'n', ep.n, 'devido', ep.devido,
      'pago', coalesce(px.pago, 0), 'pix', coalesce(px.n, 0), 'ult_pix', px.ult, 'prox', ep.prox, 'pend_mod', ep.pend_mod,
      'abertos', (select json_agg(json_build_object('d', a.d, 'v', a.v, 'ab', round(a.aberto, 2), 'f', a.func) order by a.d)
                  from ext_aberto a where a.k = ep.k)) order by ep.nome), '[]'::json) j
  from ext_pessoa ep left join fornecedores fo on fo.id = ep.fid_nome left join pix_k px on px.k = ep.k
  left join casa ca on ca.k = ep.k
  where exists (select 1 from ext_aberto a where a.k = ep.k) or ep.prox is not null or ep.pend_mod > 0),
-- Auditoria de extras
ext_pix_sem as (  -- Pix de extras para quem não tem nenhuma diária lançada no período
  select coalesce(json_agg(json_build_object('forn', fo.nome, 'pix', x.n, 'valor', x.v, 'ult', x.ult) order by x.v desc), '[]'::json) j
  from (select p.fid, count(*) n, sum(p.valor) v, max(p.data) ult from pix p
        where p.g = 'ext' and p.data >= (select ini_ext from par) and p.fid not in (select f from k_forn) group by 1) x
  join fornecedores fo on fo.id = x.fid),
ext_credito as (  -- Pix que não encontrou diária lançada antes dele (dia trabalhado sem lançamento, ou pagamento a mais)
  select coalesce(json_agg(x order by x.sobra desc), '[]'::json) j from (
    select ep.nome, fo.nome forn, ep.devido, px.pago, px.n pix,
           round(px.pago - (ep.devido - coalesce(b.b, 0)), 2) sobra
    from ext_pessoa ep join pix_k px on px.k = ep.k left join bal_ext b on b.k = ep.k
    left join fornecedores fo on fo.id = ep.fid_nome) x where x.sobra >= 300),
ext_baixa as (  -- módulo diz pendente, mas os Pix da pessoa já cobrem a diária
  select coalesce(json_agg(json_build_object('nome', d.nome, 'd', d.d, 'v', d.v, 'conta', c.status) order by d.d), '[]'::json) j
  from pass_k d left join contas_pagar c on c.id = d.conta_pagar_id
  where d.st = 'pendente' and not exists (select 1 from ext_aberto a where a.k = d.k and a.d = d.d)),
ext_freq as (  -- dias trabalhados nos últimos 30 dias (diárias lançadas ou dias com Pix, o maior)
  select coalesce(json_agg(x order by x.dias desc), '[]'::json) j from (
    select ep.nome, fo.nome forn, greatest(
      (select count(distinct d.d) from pass_k d where d.k = ep.k and d.d > (select hoje - 30 from par)),
      (select count(distinct p.data) from k_forn kf join pix p on p.fid = kf.f and p.g = 'ext'
        where kf.k = ep.k and p.data > (select hoje - 30 from par))) dias
    from ext_pessoa ep left join fornecedores fo on fo.id = ep.fid_nome) x where x.dias >= 12),
ext_sem_vinc as (select coalesce(json_agg(distinct d.nome), '[]'::json) j from pass_k d where d.fid_nome is null),

-- ── MÚSICOS ───────────────────────────────────────────────────────────────
-- Desde 05/11/2026 as contas de músico do financeiro foram limpas (antes de outubro: sem dívida).
-- A dívida de músico passa a ser a conta em aberto no financeiro, com o nome do show do módulo
-- (o fornecedor da conta às vezes é outro artista, ex. show "Zé Rodrigo e Alexandre" na conta de "Enzo e Rodrigo").
mus_ab as (
  select c.id, c.data_vencimento d, c.valor_total v, c.saldo_restante ab, btrim(coalesce(m.nome, fo.nome)) nome_show,
    btrim(regexp_replace(regexp_replace(lower(unaccent(btrim(coalesce(m.nome, fo.nome)))), '^(grupo|banda|projeto)\s+', ''),
                         '\s*(-\s*musico|\(musico\))\s*$', '')) g
  from contas_pagar c join fornecedores fo on fo.id = c.fornecedor_id
  left join musicos m on m.id = c.origem_id and c.origem_modulo = 'musicos'
  where c.categoria_id in (select id from cat_mus) and c.status <> 'pago' and c.saldo_restante > 0
    and c.data_vencimento <= (select hoje from par)),
mnome as (
  select fo.id fid, btrim(regexp_replace(regexp_replace(lower(unaccent(btrim(fo.nome))), '^(grupo|banda|projeto)\s+', ''),
                         '\s*(-\s*musico|\(musico\))\s*$', '')) g
  from fornecedores fo where fo.id in (select fid from pix where g = 'mus')),
pix_g as (select mn.g, max(p.data) ult from pix p join mnome mn on mn.fid = p.fid where p.g = 'mus' group by 1),
prox_mus as (
  select btrim(regexp_replace(regexp_replace(lower(unaccent(btrim(m.nome))), '^(grupo|banda|projeto)\s+', ''),
                         '\s*(-\s*musico|\(musico\))\s*$', '')) g, min(m.data_evento::date) prox
  from musicos m where m.status_pagamento <> 'cancelado' and m.data_evento::date > (select hoje from par) group by 1),
mus_json as (
  select coalesce(json_agg(json_build_object(
      'g', x.g, 'nome', x.nome, 'n', x.n, 'devido', x.devido, 'fin_ab', x.ab, 'pago', 0, 'pix', 0, 'sobra', 0,
      'ult_pix', px.ult, 'prox', pr.prox,
      'abertos', (select json_agg(json_build_object('d', a.d, 'v', a.v, 'ab', a.ab) order by a.d) from mus_ab a where a.g = x.g))
      order by x.nome), '[]'::json) j
  from (select g, max(nome_show) nome, count(*) n, sum(v) devido, sum(ab) ab from mus_ab group by g) x
  left join pix_g px on px.g = x.g left join prox_mus pr on pr.g = x.g),
-- show lançado no módulo com um fornecedor de outro nome (erro de cadastro, ou projeto do artista)
mus_forn_errado as (
  select coalesce(json_agg(json_build_object('show', y.show, 'forn', y.forn, 'd', y.d, 'v', y.v) order by y.d desc), '[]'::json) j from (
    select btrim(m.nome) show, btrim(fo.nome) forn, m.data_evento::date d, m.valor_total_final v,
      btrim(regexp_replace(lower(unaccent(btrim(m.nome))), '^(grupo|banda|projeto)\s+', '')) a,
      btrim(regexp_replace(lower(unaccent(btrim(fo.nome))), '^(grupo|banda|projeto)\s+', '')) b
    from musicos m join fornecedores fo on fo.id = m.fornecedor_id
    where m.status_pagamento <> 'cancelado' and m.data_evento >= (select hoje - 60 from par)) y
  where greatest(similarity(y.a, y.b), word_similarity(y.a, y.b), word_similarity(y.b, y.a)) < 0.5)

select json_build_object(
  'gerado', to_char(now() at time zone 'America/Cuiaba', 'YYYY-MM-DD"T"HH24:MI'),
  'hoje', (select hoje from par), 'ini_ext', (select ini_ext from par), 'ini_mus', (select ini_mus from par),
  'extras', (select j from ext_json),
  'ext_pix_sem_diaria', (select j from ext_pix_sem), 'ext_credito', (select j from ext_credito),
  'ext_dar_baixa', (select j from ext_baixa), 'ext_frequentes', (select j from ext_freq),
  'ext_sem_vinculo', (select j from ext_sem_vinc),
  'musicos', (select j from mus_json), 'mus_forn_errado', (select j from mus_forn_errado)
) foto;
