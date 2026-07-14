```sql
-- Drop existing table and enum if they exist to ensure a clean state
DROP TABLE IF EXISTS public.tipos_solicitacao CASCADE;
DROP TYPE IF EXISTS public.tipo_categoria_solicitacao_enum;

-- Create the enum type for tipo_categoria
CREATE TYPE public.tipo_categoria_solicitacao_enum AS ENUM (
    'manutencao',
    'aquisicao',
    'servico',
    'reforma',
    'outros'
);

-- Create the tipos_solicitacao table with the correct schema
CREATE TABLE public.tipos_solicitacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo_categoria public.tipo_categoria_solicitacao_enum NOT NULL,
    descricao text,
    valor_limite_aprovacao numeric(12,2) DEFAULT 0 NOT NULL,
    aprovacao_automatica boolean DEFAULT false NOT NULL,
    status boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tipos_solicitacao_pkey PRIMARY KEY (id)
);

-- Set RLS policies for the new table
ALTER TABLE public.tipos_solicitacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on tipos_solicitacao" ON public.tipos_solicitacao
    FOR ALL USING (true) WITH CHECK (true);

-- Insert initial data into tipos_solicitacao
INSERT INTO public.tipos_solicitacao (nome, tipo_categoria, descricao, valor_limite_aprovacao, aprovacao_automatica, status) VALUES
('Serviços Gerais', 'servico', 'Solicitações para contratação de serviços diversos.', 5000.00, false, true),
('Compra de Equipamentos', 'aquisicao', 'Solicitações para aquisição de novos equipamentos ou móveis.', 10000.00, false, true),
('Manutenção Preventiva', 'manutencao', 'Solicitações para manutenções programadas e preventivas.', 3000.00, true, true),
('Manutenção Corretiva', 'manutencao', 'Solicitações para reparos urgentes e corretivos.', 2000.00, false, true),
('Reforma e Instalação', 'reforma', 'Solicitações para reformas, pequenas obras e instalações.', 15000.00, false, true),
('Aquisição de Material', 'aquisicao', 'Solicitações para compra de materiais de consumo ou suprimentos.', 1000.00, true, true),
('Outros', 'outros', 'Solicitações que não se encaixam nas categorias existentes.', 500.00, true, true);
```