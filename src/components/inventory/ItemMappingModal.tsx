import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ItemExtracted {
  descricao: string;
  codigo?: string | null;
  quantidade: number;
  unidade?: string | null;
  valor_unitario: number;
  valor_total: number;
}

interface ItemEstoque {
  id: string;
  nome: string;
  codigo: string | null;
  unidade_medida: string;
  categoria: string;
  custo_medio: number | null;
  similarity_score?: number;
}

interface ItemMapping {
  extracted: ItemExtracted;
  matched: ItemEstoque | null;
  action: 'map' | 'create';
  searchTerm: string;
  suggestions: ItemEstoque[];
}

interface ItemMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mappings: Array<{ extracted: ItemExtracted; itemId: string | null }>) => void;
  extractedItems: ItemExtracted[];
}

const ItemMappingModal: React.FC<ItemMappingModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  extractedItems,
}) => {
  const [mappings, setMappings] = useState<ItemMapping[]>([]);
  const [allItems, setAllItems] = useState<ItemEstoque[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadItemsAndInitializeMappings();
    }
  }, [isOpen, extractedItems]);

  const loadItemsAndInitializeMappings = async () => {
    setLoading(true);
    try {
      const { data: items } = await supabase
        .from('itens_estoque')
        .select('id, nome, codigo, unidade_medida, categoria, custo_medio')
        .eq('tipo_item', 'insumo')
        .eq('status', 'ativo')
        .order('nome');

      setAllItems(items || []);

      const initialMappings = extractedItems.map((extracted) => {
        const suggestions = findSimilarItems(extracted, items || []);
        const bestMatch = suggestions[0];

        return {
          extracted,
          matched: bestMatch?.similarity_score && bestMatch.similarity_score > 0.8 ? bestMatch : null,
          action: bestMatch?.similarity_score && bestMatch.similarity_score > 0.8 ? 'map' : 'create',
          searchTerm: extracted.descricao,
          suggestions: suggestions.slice(0, 5),
        } as ItemMapping;
      });

      setMappings(initialMappings);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
    } finally {
      setLoading(false);
    }
  };

  // Função para normalizar strings: remove acentos, espaços e converte para minúsculas
  const normalizeString = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/\s+/g, '') // Remove todos os espaços
      .trim();
  };

  // Função para normalizar mantendo espaços (para busca por palavras)
  const normalizeKeepSpaces = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/\s+/g, ' ') // Normaliza espaços múltiplos para um único
      .trim();
  };

  const findSimilarItems = (extracted: ItemExtracted, items: ItemEstoque[]): ItemEstoque[] => {
    // Normalizar descrição extraída
    const descricaoNormalizada = normalizeString(extracted.descricao);
    const descricaoComEspacos = normalizeKeepSpaces(extracted.descricao);
    const searchTerms = descricaoComEspacos.split(/\s+/);
    const codigoExtracted = extracted.codigo ? normalizeString(extracted.codigo) : null;

    return items
      .map((item) => {
        let score = 0;
        const itemNomeNormalizado = normalizeString(item.nome);
        const itemNomeComEspacos = normalizeKeepSpaces(item.nome);
        const itemCodigo = item.codigo ? normalizeString(item.codigo) : null;

        // Correspondência exata de código (peso 10)
        if (codigoExtracted && itemCodigo && codigoExtracted === itemCodigo) {
          score += 10;
        }

        // Correspondência parcial de código (peso 5)
        if (codigoExtracted && itemCodigo && itemCodigo.includes(codigoExtracted)) {
          score += 5;
        }

        // Correspondência exata do nome sem espaços e acentos (peso 10)
        if (descricaoNormalizada === itemNomeNormalizado) {
          score += 10;
        }

        // Correspondência de palavras no nome (peso 2 por palavra)
        searchTerms.forEach((term) => {
          if (term.length > 2 && itemNomeComEspacos.includes(term)) {
            score += 2;
          }
        });

        // Correspondência parcial - item contém a descrição completa (peso 5)
        if (itemNomeNormalizado.includes(descricaoNormalizada) || descricaoNormalizada.includes(itemNomeNormalizado)) {
          score += 5;
        }

        // Correspondência de unidade de medida (peso 1)
        const unidadeNormalizada = extracted.unidade ? normalizeString(extracted.unidade) : null;
        const itemUnidadeNormalizada = normalizeString(item.unidade_medida);
        if (unidadeNormalizada && unidadeNormalizada === itemUnidadeNormalizada) {
          score += 1;
        }

        // Normalizar score para 0-1
        const normalizedScore = Math.min(score / 20, 1);

        return {
          ...item,
          similarity_score: normalizedScore,
        };
      })
      .filter((item) => item.similarity_score > 0.15)
      .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
  };

  const handleSearch = (index: number, searchTerm: string) => {
    const newMappings = [...mappings];
    newMappings[index].searchTerm = searchTerm;

    if (searchTerm.trim()) {
      const extracted = { ...newMappings[index].extracted, descricao: searchTerm };
      const suggestions = findSimilarItems(extracted, allItems);
      newMappings[index].suggestions = suggestions.slice(0, 5);
    } else {
      newMappings[index].suggestions = [];
    }

    setMappings(newMappings);
  };

  const handleSelectItem = (index: number, item: ItemEstoque) => {
    const newMappings = [...mappings];
    newMappings[index].matched = item;
    newMappings[index].action = 'map';
    setMappings(newMappings);
  };

  const handleCreateNew = (index: number) => {
    const newMappings = [...mappings];
    newMappings[index].matched = null;
    newMappings[index].action = 'create';
    setMappings(newMappings);
  };

  const handleConfirm = () => {
    const result = mappings.map((mapping) => ({
      extracted: mapping.extracted,
      itemId: mapping.action === 'map' && mapping.matched ? mapping.matched.id : null,
    }));
    onConfirm(result);
  };

  const getSimilarityColor = (score?: number) => {
    if (!score) return 'gray';
    if (score > 0.7) return 'green';
    if (score > 0.4) return 'yellow';
    return 'orange';
  };

  const getSimilarityText = (score?: number) => {
    if (!score) return 'Sem correspondência';
    if (score > 0.7) return 'Muito Alta';
    if (score > 0.5) return 'Alta';
    if (score > 0.4) return 'Média';
    return 'Baixa';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-white/10">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-white">Mapear Itens da Nota</h3>
            <p className="text-sm text-white/40 mt-1">
              Associe os itens da nota com itens existentes no estoque ou crie novos
            </p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/50">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C] mx-auto"></div>
              <p className="mt-4 text-white/50">Carregando itens do estoque...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {mappings.map((mapping, index) => (
                <div
                  key={index}
                  className="border border-white/10 rounded-lg p-4 bg-white/5"
                >
                  <div className="grid grid-cols-2 gap-4">
                    {/* Item Extraído */}
                    <div>
                      <h4 className="font-medium text-white mb-2 flex items-center">
                        <span className="bg-blue-500/15 text-blue-300 px-2 py-1 rounded text-xs mr-2">
                          Da Nota
                        </span>
                        Item {index + 1}
                      </h4>
                      <div className="bg-white border border-white/20 rounded-lg p-3 text-sm">
                        <div className="font-medium text-white mb-2">
                          {mapping.extracted.descricao}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-white/50">
                          {mapping.extracted.codigo && (
                            <div>
                              <span className="font-medium">Código:</span> {mapping.extracted.codigo}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Qtd:</span> {mapping.extracted.quantidade}
                          </div>
                          <div>
                            <span className="font-medium">Un:</span> {mapping.extracted.unidade || 'un'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mapeamento */}
                    <div>
                      <h4 className="font-medium text-white mb-2">Ação</h4>

                      {/* Botões de Ação */}
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => handleCreateNew(index)}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            mapping.action === 'create'
                              ? 'bg-[#7D1F2C] text-white'
                              : 'bg-white/5 border border-white/20 text-white/80 hover:bg-white/10'
                          }`}
                        >
                          <Plus className="w-4 h-4 inline mr-1" />
                          Criar Novo
                        </button>
                        <button
                          onClick={() => {
                            const newMappings = [...mappings];
                            newMappings[index].action = 'map';
                            setMappings(newMappings);
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            mapping.action === 'map'
                              ? 'bg-[#7D1F2C] text-white'
                              : 'bg-white/5 border border-white/20 text-white/80 hover:bg-white/10'
                          }`}
                        >
                          <Search className="w-4 h-4 inline mr-1" />
                          Usar Existente
                        </button>
                      </div>

                      {/* Área de Mapeamento */}
                      {mapping.action === 'map' && (
                        <div className="space-y-2">
                          {/* Item Selecionado */}
                          {mapping.matched && (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-green-300 mb-1">
                                    {mapping.matched.nome}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs text-green-400">
                                    {mapping.matched.codigo && (
                                      <div>Código: {mapping.matched.codigo}</div>
                                    )}
                                    <div>Un: {mapping.matched.unidade_medida}</div>
                                  </div>
                                </div>
                                <div className="flex items-center">
                                  <Check className="w-5 h-5 text-green-400" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Busca */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input
                              type="text"
                              value={mapping.searchTerm}
                              onChange={(e) => handleSearch(index, e.target.value)}
                              placeholder="Buscar item existente..."
                              className="w-full pl-9 pr-3 py-2 border border-white/20 rounded-lg text-sm"
                            />
                          </div>

                          {/* Sugestões */}
                          {mapping.suggestions.length > 0 && (
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {mapping.suggestions.map((item) => {
                                const color = getSimilarityColor(item.similarity_score);
                                const similarityText = getSimilarityText(item.similarity_score);

                                return (
                                  <button
                                    key={item.id}
                                    onClick={() => handleSelectItem(index, item)}
                                    className={`w-full text-left p-2 rounded-lg border transition-colors ${
                                      mapping.matched?.id === item.id
                                        ? 'bg-green-500/10 border-green-500/40'
                                        : 'bg-white border-white/10 hover:bg-white/10/5'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="text-sm font-medium text-white">
                                          {item.nome}
                                        </div>
                                        <div className="text-xs text-white/50 mt-1 flex items-center gap-2">
                                          {item.codigo && <span>Cód: {item.codigo}</span>}
                                          <span>•</span>
                                          <span>Un: {item.unidade_medida}</span>
                                          {item.custo_medio && (
                                            <>
                                              <span>•</span>
                                              <span>R$ {item.custo_medio.toFixed(2)}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <span
                                        className={`text-xs px-2 py-1 rounded ${
                                          color === 'green'
                                            ? 'bg-green-500/15 text-green-300'
                                            : color === 'yellow'
                                            ? 'bg-yellow-500/15 text-yellow-300'
                                            : 'bg-orange-500/15 text-orange-300'
                                        }`}
                                      >
                                        {similarityText}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {mapping.searchTerm && mapping.suggestions.length === 0 && (
                            <div className="text-sm text-white/40 text-center py-3">
                              Nenhum item encontrado
                            </div>
                          )}
                        </div>
                      )}

                      {mapping.action === 'create' && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-300">
                          <Plus className="w-4 h-4 inline mr-1" />
                          Um novo item será criado no estoque com o nome "{mapping.extracted.descricao}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/10 bg-white/5 flex justify-between items-center">
          <div className="text-sm text-white/50">
            <AlertTriangle className="w-4 h-4 inline mr-1 text-yellow-400" />
            {mappings.filter((m) => m.action === 'create').length} novo(s) item(ns) será(ão) criado(s)
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10/10"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] flex items-center"
            >
              <Check className="w-5 h-5 mr-2" />
              Confirmar Mapeamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemMappingModal;
