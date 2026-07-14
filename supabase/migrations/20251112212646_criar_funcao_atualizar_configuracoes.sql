/*
  # Função para atualizar configurações do sistema
  
  Cria uma função RPC que permite atualizar configurações
  de forma segura usando service role.
*/

CREATE OR REPLACE FUNCTION atualizar_configuracao_sistema(
  p_chave text,
  p_valor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE configuracoes_sistema
  SET valor = p_valor,
      atualizado_em = now()
  WHERE chave = p_chave;
  
  -- Se não existir, inserir
  IF NOT FOUND THEN
    INSERT INTO configuracoes_sistema (chave, valor)
    VALUES (p_chave, p_valor);
  END IF;
END;
$$;

-- Permitir execução para autenticados
GRANT EXECUTE ON FUNCTION atualizar_configuracao_sistema(text, text) TO authenticated;
