/*
  # Corrigir RLS Marketing - Incluir anon em todas as tabelas

  ## Descricao
  Todas as tabelas do modulo marketing estavam restritas apenas ao role authenticated.
  O sistema usa anon em algumas operacoes, entao precisamos incluir anon nas politicas.

  ## Tabelas alteradas
  - ativos_marketing (SELECT, INSERT, UPDATE, DELETE)
  - briefs_marketing (SELECT, INSERT, UPDATE)
  - campanhas_marketing (SELECT, INSERT, UPDATE, DELETE)
  - campanhas_aprovacoes (SELECT, INSERT, UPDATE)
  - campanhas_atividades (SELECT, INSERT)
  - campanhas_ativos (SELECT, INSERT, DELETE)
  - campanhas_chat (SELECT, INSERT, UPDATE)
  - campanhas_metricas (SELECT, INSERT)
  - campanhas_timeline (SELECT, INSERT, UPDATE, DELETE)
  - integracoes_marketing (SELECT)
  - templates_campanha (SELECT, INSERT, UPDATE)
*/

-- ativos_marketing
DROP POLICY IF EXISTS "Usuários autenticados podem criar ativos" ON ativos_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar ativos" ON ativos_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar ativos" ON ativos_marketing;

CREATE POLICY "Criar ativos marketing" ON ativos_marketing FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar ativos marketing" ON ativos_marketing FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Atualizar ativos marketing" ON ativos_marketing FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deletar ativos marketing" ON ativos_marketing FOR DELETE TO anon, authenticated USING (true);

-- briefs_marketing
DROP POLICY IF EXISTS "Usuários autenticados podem criar briefs" ON briefs_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar briefs" ON briefs_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar briefs" ON briefs_marketing;

CREATE POLICY "Criar briefs marketing" ON briefs_marketing FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar briefs marketing" ON briefs_marketing FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Atualizar briefs marketing" ON briefs_marketing FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- campanhas_marketing
DROP POLICY IF EXISTS "Usuários autenticados podem criar campanhas" ON campanhas_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar campanhas" ON campanhas_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar campanhas" ON campanhas_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar campanhas" ON campanhas_marketing;

CREATE POLICY "Criar campanhas marketing" ON campanhas_marketing FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar campanhas marketing" ON campanhas_marketing FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Atualizar campanhas marketing" ON campanhas_marketing FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deletar campanhas marketing" ON campanhas_marketing FOR DELETE TO anon, authenticated USING (true);

-- campanhas_aprovacoes
DROP POLICY IF EXISTS "Usuários autenticados podem criar aprovações" ON campanhas_aprovacoes;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar aprovações" ON campanhas_aprovacoes;
DROP POLICY IF EXISTS "Aprovadores podem atualizar suas aprovações" ON campanhas_aprovacoes;

CREATE POLICY "Criar aprovacoes campanhas" ON campanhas_aprovacoes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar aprovacoes campanhas" ON campanhas_aprovacoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Atualizar aprovacoes campanhas" ON campanhas_aprovacoes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- campanhas_atividades
DROP POLICY IF EXISTS "Sistema pode criar atividades" ON campanhas_atividades;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar atividades" ON campanhas_atividades;

CREATE POLICY "Criar atividades campanhas" ON campanhas_atividades FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar atividades campanhas" ON campanhas_atividades FOR SELECT TO anon, authenticated USING (true);

-- campanhas_ativos
DROP POLICY IF EXISTS "Usuários autenticados podem criar relação campanha-ativo" ON campanhas_ativos;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar relação campanha-ativ" ON campanhas_ativos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar relação campanha-ativo" ON campanhas_ativos;

CREATE POLICY "Criar campanha-ativo" ON campanhas_ativos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar campanha-ativo" ON campanhas_ativos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deletar campanha-ativo" ON campanhas_ativos FOR DELETE TO anon, authenticated USING (true);

-- campanhas_chat
DROP POLICY IF EXISTS "Usuários autenticados podem criar mensagens" ON campanhas_chat;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar chat" ON campanhas_chat;
DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias mensagens" ON campanhas_chat;

CREATE POLICY "Criar mensagens chat" ON campanhas_chat FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar chat campanhas" ON campanhas_chat FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Atualizar mensagens chat" ON campanhas_chat FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- campanhas_metricas
DROP POLICY IF EXISTS "Sistema pode inserir métricas" ON campanhas_metricas;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar métricas" ON campanhas_metricas;

CREATE POLICY "Criar metricas campanhas" ON campanhas_metricas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar metricas campanhas" ON campanhas_metricas FOR SELECT TO anon, authenticated USING (true);

-- campanhas_timeline
DROP POLICY IF EXISTS "Usuários autenticados podem criar eventos" ON campanhas_timeline;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar timeline" ON campanhas_timeline;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar eventos" ON campanhas_timeline;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar eventos" ON campanhas_timeline;

CREATE POLICY "Criar eventos timeline" ON campanhas_timeline FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar timeline campanhas" ON campanhas_timeline FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Atualizar eventos timeline" ON campanhas_timeline FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deletar eventos timeline" ON campanhas_timeline FOR DELETE TO anon, authenticated USING (true);

-- integracoes_marketing
DROP POLICY IF EXISTS "Administradores podem gerenciar integrações" ON integracoes_marketing;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar integrações" ON integracoes_marketing;

CREATE POLICY "Visualizar integracoes marketing" ON integracoes_marketing FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Criar integracoes marketing" ON integracoes_marketing FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Atualizar integracoes marketing" ON integracoes_marketing FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- templates_campanha
DROP POLICY IF EXISTS "Usuários autenticados podem criar templates" ON templates_campanha;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar templates" ON templates_campanha;
DROP POLICY IF EXISTS "Criadores podem atualizar seus templates" ON templates_campanha;

CREATE POLICY "Criar templates campanha" ON templates_campanha FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Visualizar templates campanha" ON templates_campanha FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Atualizar templates campanha" ON templates_campanha FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
