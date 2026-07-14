import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  ChevronRight,
  Home,
  DollarSign,
  Package,
  Users,
  Music,
  CalendarDays,
  AlertTriangle,
  ClipboardList,
  Settings,
  HelpCircle,
  TrendingUp,
  ChevronDown,
  Eye,
  Loader2
} from 'lucide-react';
import { PageHeader, SectionCard } from '../components/ui';
import { supabase } from '../lib/supabase';

interface Categoria {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  cor: string;
  ordem: number;
}

interface Topico {
  id: string;
  categoria_id: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  ordem: number;
  visualizacoes: number;
}

const iconMap: { [key: string]: React.ElementType } = {
  Home,
  TrendingUp,
  DollarSign,
  Package,
  Users,
  Music,
  CalendarDays,
  AlertTriangle,
  ClipboardList,
  Settings,
  HelpCircle,
  BookOpen
};

const colorMap: { [key: string]: string } = {
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  emerald: 'from-emerald-500 to-emerald-600',
  orange: 'from-orange-500 to-orange-600',
  purple: 'from-purple-500 to-purple-600',
  indigo: 'from-indigo-500 to-indigo-600',
  red: 'from-red-500 to-red-600',
  teal: 'from-teal-500 to-teal-600',
  gray: 'from-gray-500 to-gray-600',
  yellow: 'from-yellow-500 to-yellow-600'
};

const ManualUsuario: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [selectedTopico, setSelectedTopico] = useState<string | null>(null);
  const [expandedCategorias, setExpandedCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [readingTime, setReadingTime] = useState(0);

  useEffect(() => {
    fetchManual();
  }, []);

  useEffect(() => {
    if (selectedTopico) {
      const interval = setInterval(() => {
        setReadingTime((prev) => prev + 1);
      }, 1000);

      return () => {
        clearInterval(interval);
        if (readingTime > 5) {
          registrarVisualizacao();
        }
      };
    }
  }, [selectedTopico]);

  const fetchManual = async () => {
    console.log('[ManualUsuario] Iniciando fetchManual...');
    try {
      setLoading(true);

      // Buscar categorias
      console.log('[ManualUsuario] Buscando categorias...');
      const { data: categoriasData, error: catError } = await supabase
        .from('manual_categorias')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

      if (catError) {
        console.error('[ManualUsuario] Erro ao buscar categorias:', catError);
        throw catError;
      }

      console.log('[ManualUsuario] Categorias carregadas:', categoriasData?.length || 0, categoriasData);

      // Buscar tópicos
      console.log('[ManualUsuario] Buscando tópicos...');
      const { data: topicosData, error: topError } = await supabase
        .from('manual_topicos')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

      if (topError) {
        console.error('[ManualUsuario] Erro ao buscar tópicos:', topError);
        throw topError;
      }

      console.log('[ManualUsuario] Tópicos carregados:', topicosData?.length || 0, topicosData);

      console.log('[ManualUsuario] Atualizando estados...');
      setCategorias(categoriasData || []);
      setTopicos(topicosData || []);

      // Expandir primeira categoria por padrão
      if (categoriasData && categoriasData.length > 0) {
        console.log('[ManualUsuario] Expandindo primeira categoria:', categoriasData[0].id);
        setExpandedCategorias([categoriasData[0].id]);
      }

      console.log('[ManualUsuario] fetchManual concluído com sucesso!');
    } catch (error) {
      console.error('[ManualUsuario] Erro ao carregar manual:', error);
      alert('Erro ao carregar manual. Verifique o console para mais detalhes.');
    } finally {
      console.log('[ManualUsuario] Finalizando fetchManual (loading = false)');
      setLoading(false);
    }
  };

  const registrarVisualizacao = async () => {
    if (!selectedTopico) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('manual_visualizacoes')
        .insert({
          topico_id: selectedTopico,
          usuario_id: user.id,
          tempo_leitura: readingTime
        });

      setReadingTime(0);
    } catch (error) {
      console.error('Erro ao registrar visualização:', error);
    }
  };

  const toggleCategoria = (categoriaId: string) => {
    if (expandedCategorias.includes(categoriaId)) {
      setExpandedCategorias(expandedCategorias.filter(id => id !== categoriaId));
    } else {
      setExpandedCategorias([...expandedCategorias, categoriaId]);
    }
  };

  const handleTopicoClick = (topicoId: string) => {
    if (selectedTopico && readingTime > 5) {
      registrarVisualizacao();
    }
    setSelectedTopico(topicoId);
    setReadingTime(0);
  };

  const filteredCategorias = categorias.filter(cat => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const catMatch = cat.nome.toLowerCase().includes(searchLower);
    const topicosMatch = topicos
      .filter(top => top.categoria_id === cat.id)
      .some(top =>
        top.titulo.toLowerCase().includes(searchLower) ||
        top.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
        top.conteudo.toLowerCase().includes(searchLower)
      );

    return catMatch || topicosMatch;
  });

  const topicoSelecionado = topicos.find(top => top.id === selectedTopico);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#7D1F2C] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] p-3 rounded-xl">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Manual do Usuário</h1>
              <p className="text-white/60">Guia completo de uso do Sistema Ditado Popular</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar no manual..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
            />
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Table of Contents */}
          <div className="lg:col-span-1">
            <div className="bg-[#12141f] rounded-lg p-4 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Conteúdo
              </h3>

              {categorias.length === 0 && !loading && (
                <div className="text-sm text-white/40 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
                  Nenhuma categoria encontrada. Debug: {JSON.stringify({ categorias: categorias.length, topicos: topicos.length })}
                </div>
              )}

              <div className="space-y-2">
                {filteredCategorias.map((categoria) => {
                  const Icon = iconMap[categoria.icone] || BookOpen;
                  const isExpanded = expandedCategorias.includes(categoria.id);
                  const topicosCategoria = topicos.filter(t => t.categoria_id === categoria.id);

                  return (
                    <div key={categoria.id}>
                      <button
                        onClick={() => toggleCategoria(categoria.id)}
                        className="w-full flex items-center justify-between p-2 hover:bg-[#12141f]/5 rounded-lg text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5 text-[#7D1F2C]" />
                          <span className="text-sm font-medium text-white/80">
                            {categoria.nome}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-white/30" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-white/30" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="ml-7 mt-1 space-y-1">
                          {topicosCategoria.map((topico) => (
                            <button
                              key={topico.id}
                              onClick={() => handleTopicoClick(topico.id)}
                              className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                                selectedTopico === topico.id
                                  ? 'bg-[#7D1F2C] text-white'
                                  : 'text-white/60 hover:bg-[#12141f]/10'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{topico.titulo}</span>
                                {topico.visualizacoes > 0 && (
                                  <span className="flex items-center gap-1 text-xs opacity-70">
                                    <Eye className="h-3 w-3" />
                                    {topico.visualizacoes}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-[#12141f] rounded-lg p-8">
              {topicoSelecionado ? (
                <div>
                  {/* Header do Tópico */}
                  <div className="mb-6 pb-4 border-b border-white/10">
                    <h2 className="text-2xl font-bold text-white mb-2">
                      {topicoSelecionado.titulo}
                    </h2>
                    {topicoSelecionado.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {topicoSelecionado.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 text-xs bg-[#12141f]/10 text-white/60 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div
                    className="prose prose-gray max-w-none manual-content"
                    dangerouslySetInnerHTML={{ __html: topicoSelecionado.conteudo }}
                  />

                  {/* Footer do Tópico */}
                  <div className="mt-8 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between text-sm text-white/40">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        <span>{topicoSelecionado.visualizacoes} visualizações</span>
                      </div>
                      <span>Este tópico foi útil?</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <BookOpen className="h-16 w-16 text-white/20 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    Selecione um tópico
                  </h3>
                  <p className="text-white/40">
                    Escolha um tópico no menu lateral para visualizar o conteúdo
                  </p>
                  {categorias.length > 0 && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                      {categorias.slice(0, 4).map((cat) => {
                        const Icon = iconMap[cat.icone] || BookOpen;
                        const gradient = colorMap[cat.cor] || colorMap.blue;
                        return (
                          <div
                            key={cat.id}
                            onClick={() => {
                              setExpandedCategorias([cat.id]);
                              const firstTopico = topicos.find(t => t.categoria_id === cat.id);
                              if (firstTopico) {
                                handleTopicoClick(firstTopico.id);
                              }
                            }}
                            className="p-4 border border-white/10 rounded-lg hover:border-[#7D1F2C] hover:shadow-md transition-all cursor-pointer"
                          >
                            <div className={`inline-flex p-2 rounded-lg bg-gradient-to-r ${gradient} mb-2`}>
                              <Icon className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="font-semibold text-white mb-1">{cat.nome}</h4>
                            <p className="text-sm text-white/60">{cat.descricao}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Custom Styles for Manual Content */}
      <style>{`
        .manual-content h3 {
          font-size: 1.5rem;
          font-weight: 700;
          color: rgba(255,255,255,0.85);
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #7D1F2C;
        }

        .manual-content h4 {
          font-size: 1.25rem;
          font-weight: 600;
          color: rgba(255,255,255,0.7);
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }

        .manual-content p {
          color: #4b5563;
          line-height: 1.75;
          margin-bottom: 1rem;
        }

        .manual-content ul {
          list-style: disc;
          margin-left: 1.5rem;
          margin-bottom: 1rem;
          color: #4b5563;
        }

        .manual-content ol {
          list-style: decimal;
          margin-left: 1.5rem;
          margin-bottom: 1rem;
          color: #4b5563;
        }

        .manual-content li {
          margin-bottom: 0.5rem;
          line-height: 1.6;
        }

        .manual-content strong {
          color: rgba(255,255,255,0.85);
          font-weight: 600;
        }

        .manual-content ul ul,
        .manual-content ol ul {
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default ManualUsuario;
