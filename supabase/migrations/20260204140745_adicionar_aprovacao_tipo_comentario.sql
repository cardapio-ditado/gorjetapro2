/*
  # Adicionar tipo 'aprovacao' ao check constraint de comentarios_solicitacao
  
  ## Problema
  - Check constraint não permite tipo_comentario = 'aprovacao'
  - Código tenta inserir comentários de aprovação com esse tipo
  
  ## Solução
  - Remover constraint antigo
  - Criar novo constraint com 'aprovacao' incluído
*/

-- Remover constraint antigo
ALTER TABLE comentarios_solicitacao
DROP CONSTRAINT IF EXISTS comentarios_solicitacao_tipo_comentario_check;

-- Adicionar constraint atualizado com 'aprovacao'
ALTER TABLE comentarios_solicitacao
ADD CONSTRAINT comentarios_solicitacao_tipo_comentario_check
CHECK (tipo_comentario = ANY (ARRAY['geral'::text, 'tecnico'::text, 'financeiro'::text, 'interno'::text, 'aprovacao'::text]));
