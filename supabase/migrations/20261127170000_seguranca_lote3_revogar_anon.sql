-- Aplicada em 27/11/2026, depois que o Kadu publicou a main no Bolt (pedido dele: "publiquei no bolt, pode aplicar o fechamento").
--
-- Segurança, lote 3 parte 3 (Kadu, 27/11/2026): fecha o acesso direto da chave pública (anon) às tabelas do
-- DISC, da pré-entrevista e da contagem pelo celular, e às funções de contagem que o celular não usa.
--
-- QUANDO APLICAR: só depois que o Kadu publicar a main no Bolt (Netlify, www.ditado.org) e conferir que
-- /disc, /pre-entrevista e /contagem-mobile/<token> abrem e salvam usando as funções novas
-- (migração 20261127160000_seguranca_lote3_disc_preentrevista_contagem.sql, já aplicada).
-- Se aplicar antes, a versão antiga do site (que lê as tabelas direto) para de funcionar nessas três páginas.
--
-- Quem está logado (authenticated) continua com o mesmo acesso de hoje: as políticas que valiam para
-- "anon e authenticated" ou para "public" passam a valer só para authenticated; as que eram só de anon saem.
-- Nenhum dado muda.

-- 1. Contagem de estoque: políticas abertas (anon + authenticated) ficam só para authenticated
alter policy "Permitir visualizar contagens" on public.contagens_estoque to authenticated;
alter policy "Permitir criar contagens" on public.contagens_estoque to authenticated;
alter policy "Permitir atualizar contagens" on public.contagens_estoque to authenticated;
alter policy "Permitir deletar contagens" on public.contagens_estoque to authenticated;
alter policy "Permitir visualizar itens contados" on public.contagens_estoque_itens to authenticated;
alter policy "Permitir inserir itens contados" on public.contagens_estoque_itens to authenticated;
alter policy "Permitir atualizar itens contados" on public.contagens_estoque_itens to authenticated;
alter policy "Permitir deletar itens contados" on public.contagens_estoque_itens to authenticated;

-- 2. DISC: políticas só de anon saem; as de "public" ficam só para authenticated
drop policy "Anon pode ler perguntas ativas" on public.rh_disc_perguntas;
alter policy perguntas_leitura_publica on public.rh_disc_perguntas to authenticated;

drop policy "Anon pode ler resposta" on public.rh_disc_respostas;
drop policy "Anon pode inserir resposta" on public.rh_disc_respostas;
drop policy "Anon pode atualizar resposta" on public.rh_disc_respostas;
alter policy respostas_select_publico on public.rh_disc_respostas to authenticated;
alter policy respostas_insert_publico on public.rh_disc_respostas to authenticated;
alter policy respostas_update_publico on public.rh_disc_respostas to authenticated;

drop policy "Anon pode ler sessao por token" on public.rh_disc_sessoes;
drop policy "Anon pode inserir sessao" on public.rh_disc_sessoes;
drop policy "Anon pode atualizar sessao" on public.rh_disc_sessoes;
alter policy sessao_leitura_por_token on public.rh_disc_sessoes to authenticated;
alter policy sessao_update_por_token on public.rh_disc_sessoes to authenticated;

-- 3. Pré-entrevista: políticas só de anon saem
drop policy "Acesso anônimo via token para leitura" on public.rh_pre_entrevistas;
drop policy "Acesso anônimo via token para atualizar conversa" on public.rh_pre_entrevistas;
drop policy "Acesso anônimo pode criar pré-entrevistas" on public.rh_pre_entrevistas;

-- 4. Sem privilégio de tabela para anon
revoke all on table public.contagens_estoque, public.contagens_estoque_itens,
                    public.rh_disc_perguntas, public.rh_disc_respostas, public.rh_disc_sessoes,
                    public.rh_pre_entrevistas
  from anon;

-- 5. Funções de contagem que o celular não usa: só logado, servidor e leitura da IA
do $$
declare
  f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) args
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('bulk_import_contagem_itens', 'cancelar_contagem_estoque', 'finalizar_contagem_estoque',
                         'processar_contagem_estoque', 'reabrir_contagem_estoque')
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon', f.proname, f.args);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role, ia_leitura', f.proname, f.args);
  end loop;
end $$;
