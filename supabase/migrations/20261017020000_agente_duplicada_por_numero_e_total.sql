-- Nota duplicada pelo agente: número igual só bloqueia se o total também for
-- igual, e "forcar" passa por cima de qualquer bloqueio.
--
-- Caso real: na De Ville, dois espelhos do mesmo cartão saíram com o mesmo
-- "Código" (97380), um de R$ 839,00 e outro de R$ 1.332,00, sem nenhum item em
-- comum. A trava por número barrou a segunda compra mesmo com a confirmação da
-- estoquista.

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fn_agente_acao(uuid,text,jsonb,text)'::regprocedure);
  if position($a$and numero_documento = p_args->>'numero_documento' limit 1$a$ in v_def) = 0
     or position($a$if coalesce(p_args->>'numero_documento', '') <> '' then$a$ in v_def) = 0 then
    raise exception 'fn_agente_acao não tem o trecho esperado';
  end if;
  v_def := replace(v_def,
    $a$if coalesce(p_args->>'numero_documento', '') <> '' then$a$,
    $a$if coalesce(p_args->>'numero_documento', '') <> '' and not coalesce((p_args->>'forcar')::boolean, false) then$a$);
  v_def := replace(v_def,
    $a$and numero_documento = p_args->>'numero_documento' limit 1$a$,
    $a$and numero_documento = p_args->>'numero_documento' and abs(valor_total - v_total) < 0.05 limit 1$a$);
  execute v_def;
end $$;
