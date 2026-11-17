-- Conta a pagar de extra só nasce da diária no módulo Extras (Kadu, 10/11/2026).
-- O financeiro paga a conta da diária ("Pagar conta aberta"); não cria conta avulsa de extra.
create or replace function public.fn_contas_pagar_trava_extra()
returns trigger language plpgsql set search_path = public as $$
begin
  if not (new.origem_modulo = 'outros' and new.origem_id is not null)
     and (new.categoria_id in (select categoria_financeira_id from extras_tipos where categoria_financeira_id is not null
                               union select '6f030239-f3df-4ecd-a5c6-2aaa3992669b'::uuid)
          or exists (select 1 from fornecedores f where f.id = new.fornecedor_id and f.tipo = 'extra')) then
    raise exception 'Conta de extra nasce da diária no módulo Extras. Use "Pagar conta aberta" e escolha a diária.';
  end if;
  return new;
end $$;

drop trigger if exists trg_contas_pagar_trava_extra on public.contas_pagar;
create trigger trg_contas_pagar_trava_extra before insert on public.contas_pagar
  for each row execute function public.fn_contas_pagar_trava_extra();

-- Conciliação: a lista "contas_musicos" passa a trazer também as diárias de extra em aberto
-- (a chave fica com o mesmo nome para a tela publicada continuar funcionando).
create or replace function public.fn_conciliacao_sugerir(p_descricao text, p_valor numeric, p_data date, p_banco_conta_id uuid default null)
returns jsonb language sql stable set search_path = public as $$
WITH desc_norm AS (
  SELECT unaccent(lower(coalesce(p_descricao, ''))) AS d
),
forn AS (
  SELECT f.id, f.nome, f.categoria_padrao_id,
         cat.nome AS categoria_padrao_nome,
         round(similarity(unaccent(lower(f.nome)), (SELECT d FROM desc_norm))::numeric, 3) AS score
  FROM fornecedores f
  LEFT JOIN categorias_financeiras cat ON cat.id = f.categoria_padrao_id
  WHERE f.status = 'ativo'
    AND similarity(unaccent(lower(f.nome)), (SELECT d FROM desc_norm)) > 0.12
  ORDER BY score DESC
  LIMIT 5
),
contas AS (
  SELECT cp.id, cp.descricao, cp.fornecedor_id, fo.nome AS fornecedor_nome,
         cp.valor_total, cp.saldo_restante, cp.data_vencimento, cp.categoria_id
  FROM contas_pagar cp
  LEFT JOIN fornecedores fo ON fo.id = cp.fornecedor_id
  WHERE cp.status IN ('em_aberto','parcialmente_pago')
    AND abs(coalesce(cp.saldo_restante, cp.valor_total) - p_valor) <= 0.02
    AND cp.data_vencimento BETWEEN p_data - 30 AND p_data + 30
  ORDER BY abs(cp.data_vencimento - p_data) ASC
  LIMIT 10
),
musicos AS (  -- contas do módulo (show de músico ou diária de extra), a mais antiga primeiro
  SELECT cp.id, cp.descricao, cp.fornecedor_id, fo.nome AS fornecedor_nome,
         cp.valor_total, cp.saldo_restante, cp.data_vencimento, cp.categoria_id
  FROM contas_pagar cp
  JOIN fornecedores fo ON fo.id = cp.fornecedor_id
  WHERE (cp.origem_modulo = 'musicos'
         OR (cp.origem_modulo = 'outros' AND EXISTS (SELECT 1 FROM extras_freelancers x WHERE x.conta_pagar_id = cp.id)))
    AND cp.status IN ('em_aberto','parcialmente_pago') AND cp.saldo_restante > 0
    AND cp.data_vencimento <= p_data + 7
  ORDER BY fo.nome, cp.data_vencimento
),
ja_pago AS (
  SELECT fc.id AS fluxo_id, fc.data, fc.valor, fc.descricao
  FROM fluxo_caixa fc
  WHERE fc.tipo = 'saida'
    AND abs(fc.valor - p_valor) <= 0.02
    AND fc.data BETWEEN p_data - 3 AND p_data + 3
    AND (p_banco_conta_id IS NULL OR fc.conta_bancaria_id = p_banco_conta_id)
  ORDER BY abs(fc.data - p_data) ASC
  LIMIT 5
)
SELECT jsonb_build_object(
  'fornecedores', coalesce((SELECT jsonb_agg(to_jsonb(forn)) FROM forn), '[]'::jsonb),
  'contas_abertas', coalesce((SELECT jsonb_agg(to_jsonb(contas)) FROM contas), '[]'::jsonb),
  'contas_musicos', coalesce((SELECT jsonb_agg(to_jsonb(musicos)) FROM musicos), '[]'::jsonb),
  'ja_conciliado', coalesce((SELECT jsonb_agg(to_jsonb(ja_pago)) FROM ja_pago), '[]'::jsonb)
);
$$;
