import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Send, CheckCircle, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SearchableSelect } from '../components/common/SearchableSelect';

interface Estoque {
  id: string;
  nome: string;
  tipo: string;
}

interface ItemEstoque {
  id: string;
  nome: string;
  unidade_medida: string;
}

interface ItemRequisicao {
  item_id: string;
  quantidade_solicitada: number;
  observacao?: string;
  itens_estoque?: ItemEstoque;
}

interface ItemDisponivel extends ItemEstoque {
  quantidade_disponivel: number;
}

export default function RequisicaoPublica() {
  const [etapa, setEtapa] = useState<'formulario' | 'sucesso'>('formulario');
  const [numeroRequisicao, setNumeroRequisicao] = useState('');

  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [itensDisponiveis, setItensDisponiveis] = useState<ItemDisponivel[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [setor, setSetor] = useState('');
  const [estoqueOrigemId, setEstoqueOrigemId] = useState('');
  const [estoqueDestinoId, setEstoqueDestinoId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState<ItemRequisicao[]>([]);

  // Item atual sendo adicionado
  const [itemSelecionado, setItemSelecionado] = useState('');
  const [quantidadeItem, setQuantidadeItem] = useState('');
  const [observacaoItem, setObservacaoItem] = useState('');

  useEffect(() => {
    carregarEstoques();
  }, []);

  useEffect(() => {
    if (estoqueOrigemId) {
      carregarItensDisponiveis();
    } else {
      setItensDisponiveis([]);
    }
  }, [estoqueOrigemId]);

  async function carregarEstoques() {
    try {
      const { data } = await supabase
        .from('estoques')
        .select('id, nome, tipo')
        .eq('status', true)
        .order('nome');

      if (data) setEstoques(data);
    } catch (error) {
      console.error('Erro ao carregar estoques:', error);
    }
  }

  async function carregarItensDisponiveis() {
    if (!estoqueOrigemId) return;

    try {
      // Buscar todos os itens ativos
      const { data: itens } = await supabase
        .from('itens_estoque')
        .select('id, nome, unidade_medida')
        .eq('status', 'ativo')
        .order('nome');

      if (!itens) {
        setItensDisponiveis([]);
        return;
      }

      // Buscar saldos do estoque
      const { data: saldos } = await supabase
        .from('saldos_estoque')
        .select('item_id, quantidade_atual')
        .eq('estoque_id', estoqueOrigemId);

      // Criar mapa de saldos
      const saldosMap = new Map(
        saldos?.map(s => [s.item_id, s.quantidade_atual]) || []
      );

      // Combinar itens com saldos (mesmo que seja zero ou inexistente)
      const itensComSaldo = itens.map(item => ({
        id: item.id,
        nome: item.nome,
        unidade_medida: item.unidade_medida,
        quantidade_disponivel: saldosMap.get(item.id) || 0
      }));

      setItensDisponiveis(itensComSaldo);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
    }
  }

  function adicionarItem() {
    if (!itemSelecionado || !quantidadeItem || parseFloat(quantidadeItem) <= 0) {
      alert('Selecione um item e informe a quantidade');
      return;
    }

    const itemInfo = itensDisponiveis.find(i => i.id === itemSelecionado);
    if (!itemInfo) return;

    const qtdSolicitada = parseFloat(quantidadeItem);

    if (qtdSolicitada > itemInfo.quantidade_disponivel) {
      alert(`Quantidade indisponível! Disponível: ${itemInfo.quantidade_disponivel} ${itemInfo.unidade_medida}`);
      return;
    }

    const novoItem: ItemRequisicao = {
      item_id: itemSelecionado,
      quantidade_solicitada: qtdSolicitada,
      observacao: observacaoItem || undefined,
      itens_estoque: itemInfo
    };

    setItens([...itens, novoItem]);
    setItemSelecionado('');
    setQuantidadeItem('');
    setObservacaoItem('');
  }

  function removerItem(index: number) {
    setItens(itens.filter((_, i) => i !== index));
  }

  async function enviarRequisicao() {
    if (!funcionarioNome.trim()) {
      alert('Informe seu nome');
      return;
    }

    if (!whatsapp.trim()) {
      alert('Informe seu WhatsApp para contato');
      return;
    }

    if (!setor.trim()) {
      alert('Informe seu setor');
      return;
    }

    if (!estoqueOrigemId || !estoqueDestinoId) {
      alert('Selecione os estoques de origem e destino');
      return;
    }

    if (itens.length === 0) {
      alert('Adicione pelo menos um item à requisição');
      return;
    }

    setLoading(true);
    try {
      // Criar requisição
      const { data: requisicao, error: reqError } = await supabase
        .from('requisicoes_internas')
        .insert({
          numero_requisicao: '',
          funcionario_nome: funcionarioNome.trim(),
          whatsapp: whatsapp.trim(),
          setor: setor.trim(),
          estoque_origem_id: estoqueOrigemId,
          estoque_destino_id: estoqueDestinoId,
          observacoes: observacoes.trim() || null,
          status: 'pendente',
          criado_anonimamente: true
        })
        .select()
        .single();

      if (reqError) throw reqError;

      // Inserir itens
      const itensParaInserir = itens.map(item => ({
        requisicao_id: requisicao.id,
        item_id: item.item_id,
        quantidade_solicitada: item.quantidade_solicitada,
        observacao: item.observacao || null
      }));

      const { error: itensError } = await supabase
        .from('requisicoes_internas_itens')
        .insert(itensParaInserir);

      if (itensError) throw itensError;

      setNumeroRequisicao(requisicao.numero_requisicao);
      setEtapa('sucesso');
    } catch (error) {
      console.error('Erro ao enviar requisição:', error);
      alert('Erro ao enviar requisição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function novaRequisicao() {
    setEtapa('formulario');
    setNumeroRequisicao('');
    setFuncionarioNome('');
    setWhatsapp('');
    setSetor('');
    setEstoqueOrigemId('');
    setEstoqueDestinoId('');
    setObservacoes('');
    setItens([]);
    setItensDisponiveis([]);
  }

  if (etapa === 'sucesso') {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
        <div className="bg-[#12141f] rounded-2xl max-w-md w-full p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-white/85 mb-2">
              Requisição Enviada!
            </h2>
            <p className="text-white/60">
              Sua requisição foi enviada com sucesso para o estoquista.
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-white/60 mb-1">Número da Requisição</p>
            <p className="text-2xl font-bold text-blue-600">{numeroRequisicao}</p>
          </div>

          <div className="space-y-3 text-sm text-white/60 mb-6">
            <p>
              O estoquista receberá sua solicitação e entrará em contato via WhatsApp para confirmar a entrega.
            </p>
            <p className="font-medium">
              Aguarde o contato no WhatsApp: {whatsapp}
            </p>
          </div>

          <button
            onClick={novaRequisicao}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Fazer Nova Requisição
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-[#12141f] rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-xl">
              <Package className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white/85">
                Requisição de Material
              </h1>
              <p className="text-white/60">
                Solicite itens do estoque para seu setor
              </p>
            </div>
          </div>
        </div>

        {/* Formulário */}
        <div className="bg-[#12141f] rounded-2xl p-6 space-y-6">
          {/* Dados do Solicitante */}
          <div>
            <h3 className="text-lg font-semibold text-white/85 mb-4">Seus Dados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Seu Nome *
                </label>
                <input
                  type="text"
                  value={funcionarioNome}
                  onChange={(e) => setFuncionarioNome(e.target.value)}
                  className="w-full px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                  placeholder="Digite seu nome completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  WhatsApp *
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Setor *
                </label>
                <input
                  type="text"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  className="w-full px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                  placeholder="Ex: Cozinha, Bar, Salão..."
                />
              </div>
            </div>
          </div>

          {/* Estoques */}
          <div>
            <h3 className="text-lg font-semibold text-white/85 mb-4">Transferência</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <SearchableSelect
                  label="De qual estoque?"
                  options={estoques.map(est => ({ value: est.id, label: est.nome }))}
                  value={estoqueOrigemId}
                  onChange={setEstoqueOrigemId}
                  placeholder="Selecione..."
                  required
                />
              </div>
              <div>
                <SearchableSelect
                  label="Para qual estoque?"
                  options={estoques.map(est => ({ value: est.id, label: est.nome }))}
                  value={estoqueDestinoId}
                  onChange={setEstoqueDestinoId}
                  placeholder="Selecione..."
                  required
                />
              </div>
            </div>
          </div>

          {/* Adicionar Itens */}
          <div>
            <h3 className="text-lg font-semibold text-white/85 mb-4">Itens Necessários</h3>

            {!estoqueOrigemId ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-sm text-yellow-800">
                Selecione o estoque de origem para ver os itens disponíveis
              </div>
            ) : itensDisponiveis.length === 0 ? (
              <div className="bg-[#12141f]/5 border border-white/10 rounded-lg p-4 text-sm text-white/60">
                Nenhum item disponível neste estoque
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-5">
                    <SearchableSelect
                      options={itensDisponiveis.map(item => ({
                        value: item.id,
                        label: item.nome,
                        sublabel: `Disponível: ${item.quantidade_disponivel} ${item.unidade_medida}`
                      }))}
                      value={itemSelecionado}
                      onChange={setItemSelecionado}
                      placeholder="Selecione o item..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={quantidadeItem}
                      onChange={(e) => setQuantidadeItem(e.target.value)}
                      placeholder="Quantidade"
                      className="w-full px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <input
                      type="text"
                      value={observacaoItem}
                      onChange={(e) => setObservacaoItem(e.target.value)}
                      placeholder="Observação (opcional)"
                      className="w-full px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      onClick={adicionarItem}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      <Plus className="h-5 w-5" />
                      Adicionar
                    </button>
                  </div>
                </div>

                {/* Lista de Itens */}
                {itens.length > 0 && (
                  <div className="border border-white/10 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-white/10">
                      <thead className="bg-[#1a1d2e]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Item</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Unidade</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Quantidade</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Observação</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-white/40 uppercase">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 bg-[#12141f]">
                        {itens.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-3 text-sm text-white/90">{item.itens_estoque?.nome}</td>
                            <td className="px-4 py-3 text-sm text-white/60">{item.itens_estoque?.unidade_medida}</td>
                            <td className="px-4 py-3 text-sm font-medium text-white/90">{item.quantidade_solicitada}</td>
                            <td className="px-4 py-3 text-sm text-white/60">{item.observacao || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => removerItem(index)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Observações Gerais
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
              placeholder="Informações adicionais sobre sua requisição..."
            />
          </div>

          {/* Botão Enviar */}
          <button
            onClick={enviarRequisicao}
            disabled={loading || itens.length === 0}
            className="w-full bg-blue-600 text-white py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-white/10 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-lg"
          >
            <Send className="h-6 w-6" />
            {loading ? 'Enviando...' : 'Enviar Requisição'}
          </button>

          {itens.length === 0 && (
            <p className="text-sm text-white/40 text-center">
              Adicione pelo menos um item para enviar a requisição
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
