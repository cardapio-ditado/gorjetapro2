/*
  # IA do sistema passa a usar o Claude

  1. O que muda
     - `ia_modelo` substitui `openai_model`: o modelo vale para todas as funções
       de IA e pode ser trocado em Configurações › IA, sem deploy.
     - `openai_api_key` sai do banco. A chave da IA passa a viver apenas no
       ambiente das Edge Functions (secret `ANTHROPIC_API_KEY`).

  2. Por que a chave não pode ficar aqui
     A política de leitura desta tabela libera SELECT para qualquer usuário
     autenticado, ou seja, qualquer login do sistema conseguia ler a chave.
     A trava abaixo impede que uma chave volte a ser gravada aqui por engano.

  3. Atenção
     A chave da OpenAI que estava gravada nesta tabela deve ser revogada no
     painel da OpenAI, porque esteve legível para todos os usuários logados.
     O Whisper (transcrição de áudio da entrevista) continua usando a OpenAI,
     mas com a chave no secret OPENAI_API_KEY das Edge Functions.
*/

-- 1. Remove a chave e o modelo antigo do banco
DELETE FROM configuracoes_sistema WHERE chave IN ('openai_api_key', 'openai_model');

-- 2. Define o modelo padrão do Claude
INSERT INTO configuracoes_sistema (chave, valor, descricao, tipo, categoria)
VALUES (
  'ia_modelo',
  'claude-opus-5',
  'Modelo do Claude usado em todas as funções de IA do sistema',
  'texto',
  'ia'
)
ON CONFLICT (chave) DO UPDATE
SET valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    atualizado_em = now();

-- 3. Garante que a IA siga habilitada
INSERT INTO configuracoes_sistema (chave, valor, descricao, tipo, categoria)
VALUES ('ia_habilitada', 'true', 'Liga e desliga as funções de IA', 'boolean', 'ia')
ON CONFLICT (chave) DO NOTHING;

-- 4. Trava: esta tabela é lida por qualquer usuário autenticado, então não
--    pode guardar segredo nenhum.
ALTER TABLE configuracoes_sistema
  DROP CONSTRAINT IF EXISTS configuracoes_sistema_sem_segredo;

ALTER TABLE configuracoes_sistema
  ADD CONSTRAINT configuracoes_sistema_sem_segredo CHECK (
    chave !~~* '%api_key%'
    AND chave !~~* '%apikey%'
    AND chave !~~* '%secret%'
    AND chave !~~* '%token%'
    AND chave !~~* '%senha%'
    AND chave !~~* '%password%'
  );

COMMENT ON TABLE configuracoes_sistema IS
  'Configurações legíveis por qualquer usuário autenticado. Nunca gravar chaves de API, tokens ou senhas aqui: use os secrets das Edge Functions.';
