-- So fica a resposta automatica para cliente que escreve no numero do agente:
-- ninguem da equipe e avisado (o texto do aviso do Clube ja traz o WhatsApp
-- da casa). Para religar, coloque o id da pessoa em clientes_responsavel.
update public.agente_config set valor = 'null'::jsonb where chave = 'clientes_responsavel';
