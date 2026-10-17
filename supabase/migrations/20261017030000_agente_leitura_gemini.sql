-- Leitura automática das fotos de nota (Gemini), guardada junto da mensagem:
-- { leitor, ok, motivo, nota, uso, ms }. Serve de auditoria e para o histórico
-- da conversa mostrar de que nota era a foto.

alter table public.agente_mensagens add column if not exists leitura jsonb;

insert into public.agente_config (chave, valor) values ('leitor_modelo', '"gemini-3.8-flash"')
on conflict (chave) do nothing;

comment on column public.agente_mensagens.leitura is
  'Transcrição automática da foto/PDF (leitor externo). ok=false: a foto foi para o Claude ler.';
