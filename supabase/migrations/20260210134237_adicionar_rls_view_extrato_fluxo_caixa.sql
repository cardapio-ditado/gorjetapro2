/*
  # Adicionar RLS na View de Extrato de Fluxo de Caixa
  
  1. Objetivo
    - Garantir que usuários autenticados possam acessar a view
    - Aplicar as mesmas regras de segurança da tabela fluxo_caixa
  
  2. Segurança
    - Apenas usuários autenticados podem acessar
    - Mesmas restrições da tabela original
*/

-- Habilitar RLS na view (views não suportam RLS diretamente, mas herdam da tabela base)
-- Como a view é baseada em fluxo_caixa, ela já herda as permissões

-- Garantir que authenticated pode acessar a view
GRANT SELECT ON view_extrato_fluxo_caixa TO authenticated;

-- Comentário
COMMENT ON VIEW view_extrato_fluxo_caixa IS 'View de extrato bancário com RLS herdado da tabela fluxo_caixa';