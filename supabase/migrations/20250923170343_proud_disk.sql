-- Fix missing tables and view for solicitações system

-- Create tipos_solicitacao table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.tipos_solicitacao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    tipo_categoria text NOT NULL CHECK (tipo_categoria IN ('manutencao', 'aquisicao', 'servico', 'reforma')),
    descricao text,
    valor_limite_aprovacao numeric(12,2) DEFAULT 0,
    aprovacao_automatica boolean DEFAULT false,
    status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    criado_em timestamp with time zone DEFAULT now()
);

-- Create solicitacoes table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.solicitacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_solicitacao text UNIQUE NOT NULL,
    tipo_solicitacao_id uuid REFERENCES public.tipos_solicitacao(id),
    titulo text NOT NULL,
    descricao text NOT NULL,
    prioridade text DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente', 'critica')),
    status text DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'em_analise', 'aprovado', 'rejeitado', 'em_execucao', 'concluido', 'cancelado')),
    solicitante_nome text NOT NULL,
    solicitante_email text,
    solicitante_telefone text,
    setor_solicitante text NOT NULL,
    local_servico text,
    equipamento_afetado text,
    detalhes_tecnicos text,
    data_solicitacao timestamp with time zone DEFAULT now(),
    data_limite date,
    valor_estimado numeric(12,2) DEFAULT 0,
    valor_aprovado numeric(12,2) DEFAULT 0,
    valor_total_orcado numeric(12,2) DEFAULT 0,
    fornecedor_responsavel text,
    contato_fornecedor text,
    numero_orcamento text,
    responsavel_execucao text,
    criado_em timestamp with time zone DEFAULT now()
);

-- Create anexos_solicitacao table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.anexos_solicitacao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitacao_id uuid REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
    nome_arquivo text NOT NULL,
    tipo_arquivo text,
    tamanho_arquivo integer,
    url_arquivo text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);

-- Create comentarios_solicitacao table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.comentarios_solicitacao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitacao_id uuid REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
    autor_nome text NOT NULL,
    autor_email text,
    tipo_comentario text DEFAULT 'geral' CHECK (tipo_comentario IN ('geral', 'tecnico', 'financeiro', 'interno')),
    comentario text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.tipos_solicitacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_solicitacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_solicitacao ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now)
CREATE POLICY "Allow all operations on tipos_solicitacao" ON public.tipos_solicitacao FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on solicitacoes" ON public.solicitacoes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on anexos_solicitacao" ON public.anexos_solicitacao FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on comentarios_solicitacao" ON public.comentarios_solicitacao FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Create the missing view
CREATE OR REPLACE VIEW public.vw_solicitacoes_completas AS
SELECT
    s.id,
    s.numero_solicitacao,
    s.tipo_solicitacao_id,
    ts.nome AS tipo_nome,
    ts.tipo_categoria,
    s.titulo,
    s.descricao,
    s.prioridade,
    s.status,
    s.solicitante_nome,
    s.solicitante_email,
    s.solicitante_telefone,
    s.setor_solicitante,
    s.local_servico,
    s.equipamento_afetado,
    s.detalhes_tecnicos,
    s.data_solicitacao,
    s.data_limite,
    s.valor_estimado,
    s.valor_aprovado,
    s.valor_total_orcado,
    s.fornecedor_responsavel,
    s.contato_fornecedor,
    s.numero_orcamento,
    s.responsavel_execucao,
    s.criado_em,
    COALESCE(ac.total_anexos, 0) AS total_anexos,
    COALESCE(cc.total_comentarios, 0) AS total_comentarios
FROM
    public.solicitacoes s
LEFT JOIN
    public.tipos_solicitacao ts ON s.tipo_solicitacao_id = ts.id
LEFT JOIN (
    SELECT
        solicitacao_id,
        COUNT(*) AS total_anexos
    FROM
        public.anexos_solicitacao
    GROUP BY
        solicitacao_id
) ac ON s.id = ac.solicitacao_id
LEFT JOIN (
    SELECT
        solicitacao_id,
        COUNT(*) AS total_comentarios
    FROM
        public.comentarios_solicitacao
    GROUP BY
        solicitacao_id
) cc ON s.id = cc.solicitacao_id;