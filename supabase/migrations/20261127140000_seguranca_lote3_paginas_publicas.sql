-- Segurança, lote 3 parte 1 (Kadu, 27/11/2026): tabelas usadas pelas páginas públicas.
-- Cada página pública passa a poder só o que ela faz, sem mudar o site:
--   /requisicao-estoque: lê estoques, itens e saldos; cria a requisição (e lê de volta a que acabou de criar) e os itens.
--   /solicitacao: cria a solicitação (e lê de volta a que acabou de criar) e as fotos.
--   /reservar-mesa e /mapademesas: leem mesas e reservas do dia e criam reserva (não alteram nem apagam mais).
-- O visitante deixa de poder alterar estoque, saldos, itens, requisições, solicitações e reservas.
-- Os números REQ-/SOL- são gerados lendo a tabela inteira: as funções passam a rodar com permissão própria
-- para a numeração continuar certa depois de limitar a leitura do visitante.
-- Ficam para a parte 2 (funções próprias, com mudança no site): contagem pelo celular, DISC e pré-entrevista.
-- Nenhum dado muda.

-- 1. Numeração
alter function public.gerar_numero_requisicao() security definer set search_path = public;
alter function public.gerar_numero_solicitacao() security definer set search_path = public;

-- 2. Estoques, itens e saldos: visitante só lê (as políticas "Permitir anon ler ..." continuam)
alter policy "Allow all operations on estoques" on public.estoques to authenticated;
alter policy "Allow all operations on itens_estoque" on public.itens_estoque to authenticated;
alter policy "Allow all operations on saldos_estoque" on public.saldos_estoque to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.estoques, public.itens_estoque, public.saldos_estoque from anon;

-- 3. Requisição pública: cria e lê de volta só a requisição anônima recém-criada
alter policy "Acesso total requisicoes" on public.requisicoes_internas to authenticated;
alter policy "Acesso total requisicoes itens" on public.requisicoes_internas_itens to authenticated;
create policy requisicao_publica_ler_recem_criada on public.requisicoes_internas for select to anon
  using (criado_anonimamente and created_at > now() - interval '10 minutes');
revoke update, delete, truncate, references, trigger on public.requisicoes_internas from anon;
revoke select, update, delete, truncate, references, trigger on public.requisicoes_internas_itens from anon;

-- 4. Solicitação pública: cria e lê de volta só a solicitação pública recém-criada
alter policy "Allow all operations on solicitacoes" on public.solicitacoes to authenticated;
create policy solicitacao_publica_criar on public.solicitacoes for insert to anon with check (origem = 'publica');
create policy solicitacao_publica_ler_recem_criada on public.solicitacoes for select to anon
  using (origem = 'publica' and criado_em > now() - interval '10 minutes');
revoke update, delete, truncate, references, trigger on public.solicitacoes from anon;

-- 5. Reservas de mesa pelo mapa: visitante lê e cria; não altera nem apaga
alter policy anon_delete_reservas_mesas on public.reservas_mesas to authenticated;
alter policy anon_update_reservas_mesas on public.reservas_mesas to authenticated;
revoke update, delete, truncate, references, trigger on public.reservas_mesas from anon;
revoke insert, update, delete, truncate, references, trigger on public.mesas from anon;
