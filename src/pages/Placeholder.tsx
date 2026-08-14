import { Link, useParams } from 'react-router-dom';
import { Construction } from 'lucide-react';

const NOMES: Record<string, string> = {
  'estoque-central': 'Estoque Central',
  'estoque-eventos': 'Estoque de Eventos',
  financeiro: 'Financeiro Central',
  fechamento: 'Fechamento de Evento',
  equipe: 'Equipe & Freelancers',
  materiais: 'Materiais & Logística',
  compras: 'Compras & Fornecedores',
  relatorios: 'Relatórios & Painéis',
  usuarios: 'Usuários & Permissões',
};

export default function Placeholder() {
  const { slug } = useParams();
  const nome = NOMES[slug ?? ''] ?? 'Módulo';

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold-600/30 bg-gold-500/10 text-gold-400">
        <Construction className="h-8 w-8" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-white">{nome}</h2>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        Este módulo está no plano de desenvolvimento e será liberado em breve.
      </p>
      <Link to="/" className="btn-gold mt-8">
        Voltar aos módulos
      </Link>
    </div>
  );
}
