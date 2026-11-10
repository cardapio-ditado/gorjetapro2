-- Andar Operacional (Central de agentes do Ditado): foto do dia de Extras e Músicos.
-- SOMENTE LEITURA.
--
-- Regra (combinada com o Kadu em 10/11/2026): a FILA DE PAGAR segue o CONTROLE DO CRISTIANO,
-- isto é, o que está em aberto nos módulos de Extras (extras_freelancers.saldo_restante) e de
-- Músicos (musicos.saldo_restante), depois dos pagamentos que ele informa no módulo.
-- O financeiro entra só para comparar (seção "comparativo"): Contas a Pagar em aberto, vencidas
-- até hoje, nas categorias de extras e de cachê. Nada um sobrescreve o outro.
--   Prazo: extra registrado na casa 7 dias, extra de fora 2 dias, músico 7 dias (aplicado na página).
-- Extras: desde 01/08/2026. Músicos: shows desde 01/10/2026 (antes disso não há dívida, limpo em 05/11).
-- Pessoa do módulo de Extras → quem recebe o Pix: extras_pessoas.fornecedor_id, ou pelo nome.
-- Artista: o nome do show ("Projeto · Artista" ou "Projeto - Artista" vale o artista), sem "grupo/banda/projeto";
-- nomes com até 2 letras de diferença são o mesmo artista (ex. "Patrick Siquera" e "Patrick Siqueira").
-- Saída: um único JSON (coluna "foto") para gravar no artifact (coleção op, doc foto).
with
par as (select (now() at time zone 'America/Cuiaba')::date hoje, date '2026-08-01' ini_ext, date '2026-10-01' ini_mus),
cat_ext as (select unnest(array['2c6658df-ab7a-4398-9b0e-bc6af11556ee','e39e5a83-fe45-4f3e-a8a2-0a5806f73085',
  'f867b394-d8c5-4e59-aacf-e02f0078fbca','eff211e3-e096-40b8-8854-3b7d1ef888f7','ae5f2dff-2ea4-4b8f-a9e9-7bbe8e3f2906',
  '6f030239-f3df-4ecd-a5c6-2aaa3992669b']::uuid[]) id),
cat_mus as (select '8a0e65eb-e5c1-4ab9-a03c-6103c9071883'::uuid id),
-- todos os Pix (saídas) do período, com quem recebeu
pix as (
  select fc.data, fc.valor, c.fornecedor_id fid,
         case when fc.categoria_id in (select id from cat_mus) then 'mus' else 'ext' end g
  from fluxo_caixa fc join contas_pagar c on c.id = fc.conta_pagar_id
  where fc.tipo = 'saida' and fc.data >= (select ini_ext - 60 from par)
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
  from pes p cross join forn_ext f
  where f.id is distinct from p.fid_cad
    and (p.fid_cad is null or p.fid_cad not in (select id from forn_ext))),
cand as (select *, row_number() over (partition by pk order by s desc) r from cand0),
vinc as (
  select p.pk, p.fid_cad,
    (select c1.fid from cand c1 where c1.pk = p.pk and c1.r = 1 and c1.s >= 0.6
       and c1.s - coalesce((select c2.s from cand c2 where c2.pk = p.pk and c2.r = 2), 0) >= 0.08) fid_nome
  from pes p),
dia as (
  select e.id, coalesce(pp.id::text, 'n:' || lower(btrim(e.nome))) pk, coalesce(pp.nome, btrim(e.nome)) nome,
         v.fid_nome, v.fid_cad, e.data_trabalho d, e.valor_diaria v, e.funcao_temporaria func, e.pedido_por,
         e.status_pagamento st, e.conta_pagar_id,
         coalesce(e.saldo_restante, e.valor_diaria - coalesce(e.valor_pago, 0)) sal, coalesce(e.valor_pago, 0) vp
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
-- Pix que já saiu da Stone e o financeiro ainda não deu baixa (linha do extrato pendente e
-- sem saída de mesmo valor, ±3 dias, para alguém de nome parecido no fluxo de caixa).
banco as (
  select b.id, b.data, abs(b.valor) v, b.operacao,
         btrim(lower(unaccent(regexp_replace(coalesce(b.contraparte_nome, ''), '^[0-9. ]+', '')))) n
  from banco_extrato b
  where b.status = 'pendente' and b.sentido = 'debito'
    and not exists (select 1 from fluxo_caixa fc join contas_pagar c on c.id = fc.conta_pagar_id
                    join fornecedores fo on fo.id = c.fornecedor_id
                    where fc.tipo = 'saida' and abs(fc.valor - abs(b.valor)) < 0.01
                      and fc.data between b.data - 3 and b.data + 3
                      and (similarity(lower(unaccent(fo.nome)), lower(unaccent(coalesce(b.contraparte_nome, '')))) >= 0.35
                        -- mesmo primeiro nome ("ALSEDIR SEGURANÇA" × "Alsedir Filho dos Santos")
                        or (length(split_part(btrim(lower(unaccent(fo.nome))), ' ', 1)) > 2
                            and split_part(btrim(lower(unaccent(fo.nome))), ' ', 1)
                              = split_part(btrim(lower(unaccent(regexp_replace(coalesce(b.contraparte_nome, ''), '^[0-9. ]+', '')))), ' ', 1))))),
corte as (select coalesce(min(data), (select hoje from par) + 1) - 1 d from banco),
kfn as (select distinct kf.k, btrim(lower(unaccent(fo.nome))) n from k_forn kf join fornecedores fo on fo.id = kf.f),
ban_c as (  -- vale-transporte (71,40) é de colaborador, não é diária
  select b.id, b.data, b.v, f.k,
         greatest(similarity(b.n, f.n),
           case when array_length(string_to_array(f.n, ' '), 1) >= 2
                 and (select bool_and(t = any (string_to_array(b.n, ' '))) from unnest(string_to_array(f.n, ' ')) t where length(t) > 2)
                then 0.95 else 0 end) s
  from banco b cross join kfn f where b.operacao = 'PIX' and b.v <> 71.40),
ban_k as (select id, data, v, k from (select *, row_number() over (partition by id order by s desc) r from ban_c where s >= 0.6) x where r = 1),
ban_sum as (select k, sum(v) v, json_agg(json_build_object('d', data, 'v', v) order by data) j from ban_k group by k),
pass_k as (select * from dia_k where d <= (select hoje from par)),
-- CONTROLE DO CRISTIANO: diária com saldo no módulo
ctl_ab as (select * from pass_k where st <> 'pago' and sal > 0.009),
ult_pag as (
  select dk.k, max(ep.data_pagamento) ult
  from extras_pagamentos ep join dia_k dk on dk.id = ep.extra_id
  where ep.tipo = 'pagamento' and ep.estornado_em is null group by dk.k),
-- Auditoria pelo Pix (antiga régua): um Pix só paga diária do mesmo dia ou anterior.
ev_ext as (
  select k, d dt, 0 o, v x from pass_k
  union all
  select kf.k, p.data, 1, -p.valor from k_forn kf join pix p on p.fid = kf.f and p.g = 'ext' and p.data >= (select ini_ext from par)),
cum_ext as (select k, dt, o, sum(x) over (partition by k order by dt, o rows unbounded preceding) s from ev_ext),
bal_ext as (select k, (array_agg(s order by dt desc, o desc))[1] - least(0, min(s)) b from cum_ext group by k),
rev_ext as (select k, d, v, func, pedido_por, sum(v) over (partition by k order by d desc, id desc rows unbounded preceding) rc from pass_k),
ext_aberto as (
  select r.k, r.d, r.v, r.func, r.pedido_por, least(r.v, b.b - (r.rc - r.v)) aberto
  from rev_ext r join bal_ext b on b.k = r.k where b.b - (r.rc - r.v) > 0.009),
-- FINANCEIRO: contas a pagar de extras em aberto, vencidas até hoje, na pessoa
cp_ext as (
  select c.id, c.saldo_restante sal, c.fornecedor_id fid, c.data_vencimento d,
    coalesce((select dk.k from dia_k dk where dk.conta_pagar_id = c.id limit 1),
             (select kf.k from k_forn kf where kf.f = c.fornecedor_id limit 1),
             'f:' || c.fornecedor_id) k
  from contas_pagar c
  where c.categoria_id in (select id from cat_ext) and c.status <> 'pago' and c.saldo_restante > 0
    and c.data_vencimento <= (select hoje from par)),
cp_ext_k as (select k, sum(sal) ab, count(*) n from cp_ext group by k),
ext_pessoa as (
  select k, (array_agg(nome order by d desc))[1] nome, min(coalesce(fid_nome, fid_cad)::text)::uuid fid_nome,
         count(*) filter (where d <= (select hoje from par)) n, coalesce(sum(v) filter (where d <= (select hoje from par)), 0) devido,
         coalesce(sum(vp) filter (where d <= (select hoje from par)), 0) pago_ctl,
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
      'pago_ctl', ep.pago_ctl, 'ult_pag', up.ult, 'fin_ab', coalesce(cp.ab, 0),
      'pago', coalesce(px.pago, 0), 'pix', coalesce(px.n, 0), 'ult_pix', px.ult, 'prox', ep.prox, 'pend_mod', ep.pend_mod,
      'banco_v', coalesce(bs.v, 0), 'banco', bs.j,
      'abertos', (select json_agg(json_build_object('d', a.d, 'v', a.v, 'ab', round(a.sal, 2), 'f', a.func) order by a.d)
                  from ctl_ab a where a.k = ep.k)) order by ep.nome), '[]'::json) j
  from ext_pessoa ep left join fornecedores fo on fo.id = ep.fid_nome left join pix_k px on px.k = ep.k
  left join casa ca on ca.k = ep.k left join ban_sum bs on bs.k = ep.k left join ult_pag up on up.k = ep.k
  left join cp_ext_k cp on cp.k = ep.k
  where exists (select 1 from ctl_ab a where a.k = ep.k) or ep.prox is not null or bs.k is not null or cp.ab > 0),
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
ext_sem_vinc as (select coalesce(json_agg(distinct d.nome), '[]'::json) j from pass_k d
  where coalesce(d.fid_nome, d.fid_cad) is null or coalesce(d.fid_nome, d.fid_cad) not in (select id from forn_ext)),

-- ── MÚSICOS ───────────────────────────────────────────────────────────────
-- CONTROLE DO CRISTIANO: shows do módulo com saldo (musicos.saldo_restante).
-- Chave do artista: parte depois de "·" ou " - " (o artista), sem "grupo/banda/projeto" e sem "- músico".
mus_show as (
  select m.id, m.fornecedor_id fid, m.data_evento::date d, m.valor_total_final v, coalesce(m.valor_pago, 0) vp,
    case when m.status_pagamento = 'pago' then 0 else greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0) end ab,
    btrim(m.nome) nome_show,
    btrim(regexp_replace(regexp_replace(lower(unaccent(btrim(
      case when m.nome like '%·%' then split_part(m.nome, '·', 2)
           when m.nome ~ '\s-\s' and m.nome !~* '-\s*m[uú]sico\s*$' then regexp_replace(m.nome, '^.*\s-\s', '')
           else m.nome end))), '^(grupo|banda|projeto)\s+', ''), '\s*(-\s*musico|\(musico\))\s*$', '')) k0
  from musicos m
  where m.status_pagamento <> 'cancelado' and m.data_evento::date >= (select ini_mus from par)),
-- FINANCEIRO: contas de cachê em aberto, vencidas até hoje; o artista vem do show (origem) ou do fornecedor
cp_mus as (
  select c.id, c.saldo_restante sal, c.data_vencimento d,
    coalesce((select s.k0 from mus_show s where s.id = c.origem_id and c.origem_modulo = 'musicos'),
      (select s.k0 from mus_show s where s.fid = c.fornecedor_id order by s.d desc limit 1),  -- conta no fornecedor do show (ex. Karanova paga como Nobatuk)
      btrim(regexp_replace(regexp_replace(lower(unaccent(btrim(fo.nome))), '^(grupo|banda|projeto)\s+', ''), '\s*(-\s*musico|\(musico\))\s*$', ''))) k0,
    btrim(fo.nome) forn
  from contas_pagar c join fornecedores fo on fo.id = c.fornecedor_id
  where c.categoria_id in (select id from cat_mus) and c.status <> 'pago' and c.saldo_restante > 0
    and c.data_vencimento <= (select hoje from par)),
mus_k0 as (select k0 from mus_show union select k0 from cp_mus),
-- mesmo artista com até 2 letras de diferença ("patrick siquera" = "patrick siqueira")
mus_k as (select a.k0, (select min(b.k0) from mus_k0 b where b.k0 = a.k0 or (length(a.k0) >= 8 and levenshtein(a.k0, b.k0) <= 2)) g from mus_k0 a),
mus_ctl as (select s.*, k.g from mus_show s join mus_k k on k.k0 = s.k0),
mus_cp as (select c.*, k.g from cp_mus c join mus_k k on k.k0 = c.k0),
mus_ab as (select * from mus_ctl where d <= (select hoje from par) and ab > 0.009),
mus_ult as (select mc.g, max(mp.data_pagamento) ult from musicos_pagamentos mp join mus_ctl mc on mc.id = mp.musico_id
  where mp.tipo = 'pagamento' and mp.estornado_em is null group by mc.g),
prox_mus as (select g, min(d) prox from mus_ctl where d > (select hoje from par) group by g),
mus_ban as (  -- Pix no banco sem baixa para o artista (todas as palavras do nome no nome de quem recebeu)
  select x.g, sum(b.v) v, json_agg(json_build_object('d', b.data, 'v', b.v) order by b.data) j
  from (select distinct g from mus_ab) x join banco b on b.operacao = 'PIX' and b.v <> 71.40
   and (similarity(x.g, b.n) >= 0.6
        or (array_length(string_to_array(x.g, ' '), 1) >= 2
            and (select bool_and(t = any (string_to_array(b.n, ' '))) from unnest(string_to_array(x.g, ' ')) t where length(t) > 2)))
  group by x.g),
mus_json as (
  select coalesce(json_agg(json_build_object(
      'g', x.g, 'nome', x.nome, 'n', x.n, 'devido', x.devido, 'pago', x.pago,
      'fin_ab', coalesce((select sum(c.sal) from mus_cp c where c.g = x.g), 0), 'pix', 0, 'sobra', 0,
      'ult_pag', mu.ult, 'prox', pr.prox, 'banco_v', coalesce(mb.v, 0), 'banco', mb.j,
      'abertos', (select json_agg(json_build_object('d', a.d, 'v', a.v, 'ab', round(a.ab, 2)) order by a.d) from mus_ab a where a.g = x.g))
      order by x.nome), '[]'::json) j
  from (select g, (array_agg(nome_show order by d desc))[1] nome, count(*) n, sum(v) devido, sum(vp) pago from mus_ab group by g) x
  left join mus_ult mu on mu.g = x.g left join prox_mus pr on pr.g = x.g left join mus_ban mb on mb.g = x.g),
-- show lançado no módulo com um fornecedor de outro nome (erro de cadastro, ou projeto do artista)
mus_forn_errado as (
  select coalesce(json_agg(json_build_object('show', y.show, 'forn', y.forn, 'd', y.d, 'v', y.v) order by y.d desc), '[]'::json) j from (
    select btrim(m.nome) show, btrim(fo.nome) forn, m.data_evento::date d, m.valor_total_final v,
      btrim(regexp_replace(lower(unaccent(btrim(m.nome))), '^(grupo|banda|projeto)\s+', '')) a,
      btrim(regexp_replace(lower(unaccent(btrim(fo.nome))), '^(grupo|banda|projeto)\s+', '')) b
    from musicos m join fornecedores fo on fo.id = m.fornecedor_id
    where m.status_pagamento <> 'cancelado' and m.data_evento >= (select hoje - 60 from par)) y
  where greatest(similarity(y.a, y.b), word_similarity(y.a, y.b), word_similarity(y.b, y.a)) < 0.5),

-- ── COMPARATIVO: em aberto no controle × em aberto no financeiro (vencido até hoje) ──
comp as (
  select 'extra' tipo, ep.k chave, ep.nome, fo.nome quem,
    coalesce((select sum(a.sal) from ctl_ab a where a.k = ep.k), 0) ctl,
    coalesce((select ab from cp_ext_k c where c.k = ep.k), 0) fin
  from ext_pessoa ep left join fornecedores fo on fo.id = ep.fid_nome
  union all  -- conta de extra em aberto num fornecedor que não é de nenhuma pessoa do módulo
  select 'extra', c.k, fo.nome, fo.nome, 0, c.ab
  from cp_ext_k c join fornecedores fo on 'f:' || fo.id = c.k
  union all
  select 'musico', g.g, coalesce((select (array_agg(s.nome_show order by s.d desc))[1] from mus_ctl s where s.g = g.g),
                                 (select min(c.forn) from mus_cp c where c.g = g.g)), null,
    coalesce((select sum(a.ab) from mus_ab a where a.g = g.g), 0),
    coalesce((select sum(c.sal) from mus_cp c where c.g = g.g), 0)
  from (select distinct g from mus_k) g),
comp_json as (
  select coalesce(json_agg(json_build_object('tipo', tipo, 'nome', nome, 'quem', quem, 'ctl', round(ctl, 2), 'fin', round(fin, 2),
           'dif', round(fin - ctl, 2)) order by abs(fin - ctl) desc, nome), '[]'::json) j
  from comp where ctl > 0.009 or fin > 0.009)

select json_build_object(
  'gerado', to_char(now() at time zone 'America/Cuiaba', 'YYYY-MM-DD"T"HH24:MI'),
  'fonte', 'controle',
  'hoje', (select hoje from par), 'ini_ext', (select ini_ext from par), 'ini_mus', (select ini_mus from par),
  'corte', (select d from corte),
  'banco_sem_baixa', (select json_build_object('n', count(*), 'v', round(coalesce(sum(v), 0), 2), 'desde', min(data), 'ate', max(data)) from banco),
  'extras', (select j from ext_json),
  'ext_pix_sem_diaria', (select j from ext_pix_sem), 'ext_credito', (select j from ext_credito),
  'ext_dar_baixa', (select j from ext_baixa), 'ext_frequentes', (select j from ext_freq),
  'ext_sem_vinculo', (select j from ext_sem_vinc),
  'musicos', (select j from mus_json), 'mus_forn_errado', (select j from mus_forn_errado),
  'comparativo', (select j from comp_json)
) foto;
