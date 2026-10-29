-- Busca nas compras recebidas (Receber compras › Recebidas): por parte do nome
-- do produto ou do fornecedor, em todas as notas (a tela só lista as 30
-- últimas). Cada nota traz os itens que bateram com a busca.
create or replace function public.fn_recebimento_buscar(p_texto text, p_limite integer default 40)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with b as (select '%' || lower(unaccent(trim(coalesce(p_texto, '')))) || '%' padrao),
  notas as (
    select e.id, e.data_compra, e.criado_em, e.valor_total, e.numero_documento, e.origem_arquivo_url, coalesce(f.nome, 'Sem fornecedor') fornecedor,
           lower(unaccent(coalesce(f.nome, ''))) like (select padrao from b) bate_fornecedor
      from entradas_compras e
      left join fornecedores f on f.id = e.fornecedor_id
     where e.status = 'recebido'
  ),
  itens as (
    select ie.entrada_compra_id, i.nome, i.unidade_medida um,
           coalesce(ie.quantidade_recebida, ie.quantidade) qtd, coalesce(ie.custo_unitario_final, ie.custo_unitario) custo
      from itens_entrada_compra ie join itens_estoque i on i.id = ie.item_id
     where lower(unaccent(i.nome)) like (select padrao from b)
  )
  select coalesce(jsonb_agg(x order by x->>'data_compra' desc, x->>'criado_em' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', n.id, 'fornecedor', n.fornecedor, 'data_compra', n.data_compra, 'criado_em', n.criado_em, 'valor', n.valor_total,
               'numero_documento', n.numero_documento, 'arquivo', n.origem_arquivo_url,
               'itens', (select count(*) from itens_entrada_compra ie where ie.entrada_compra_id = n.id),
               'achados', coalesce((select jsonb_agg(jsonb_build_object('nome', it.nome, 'um', it.um, 'qtd', it.qtd, 'custo', round(it.custo, 4)) order by it.nome)
                                      from itens it where it.entrada_compra_id = n.id), '[]'::jsonb)) x
        from notas n
       where length(trim(coalesce(p_texto, ''))) >= 2
         and (n.bate_fornecedor or exists (select 1 from itens it where it.entrada_compra_id = n.id))
       order by n.data_compra desc, n.criado_em desc
       limit greatest(1, least(coalesce(p_limite, 40), 200))
    ) t
$function$;

revoke execute on function public.fn_recebimento_buscar(text, integer) from public, anon;
grant execute on function public.fn_recebimento_buscar(text, integer) to authenticated;
