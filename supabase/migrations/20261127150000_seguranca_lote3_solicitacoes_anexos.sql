-- Segurança, lote 3 (Kadu, 27/11/2026): solicitacoes_anexos tinha políticas escritas, mas o RLS estava desligado,
-- então o visitante lia e apagava todos os anexos. Liga o RLS (as políticas já existentes passam a valer:
-- visitante cria e lê só anexo de solicitação pública recém-criada) e tira alterar/apagar do visitante.
alter table public.solicitacoes_anexos enable row level security;
revoke update, delete, truncate, references, trigger on public.solicitacoes_anexos from anon;
