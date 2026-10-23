-- Nomes dos modelos aprovados na Meta pelo Kadu (podem mudar na tela do Clube,
-- botao Mensagens).
insert into public.agente_config (chave, valor, atualizado_em)
values ('clube_modelo_boas_vindas', to_jsonb('boas_vindas_clube'::text), now()),
       ('clube_modelo', to_jsonb('prazo_clube'::text), now())
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
