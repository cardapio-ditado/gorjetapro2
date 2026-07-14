import React, { useState, useEffect } from 'react';
import { Plus, Briefcase, MapPin, DollarSign, Users, Eye, CreditCard as Edit, Pause, Play, XCircle, Search } from 'lucide-react';
import { vagaService, cargoService, Vaga, Cargo } from '../../services/rhService';

const GestaoVagas: React.FC = () => {
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Vaga | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todas');

  const [formData, setFormData] = useState({
    cargo_id: '',
    titulo: '',
    descricao: '',
    requisitos: '',
    local_trabalho: '',
    regime_contratual: 'CLT',
    salario_faixa: '',
    beneficios: '',
    status: 'aberta' as 'aberta' | 'pausada' | 'fechada'
  });

  useEffect(() => {
    carregarDados();
  }, [statusFilter]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      console.log('Iniciando carregamento de dados...');

      const vagasData = await vagaService.listar(statusFilter === 'todas' ? undefined : statusFilter);
      console.log('Vagas carregadas:', vagasData);

      const cargosData = await cargoService.listar();
      console.log('Cargos carregados:', cargosData);

      setVagas(vagasData);
      const cargosAtivos = cargosData.filter(c => c.status === 'ativo');
      console.log('Cargos ativos filtrados:', cargosAtivos);
      setCargos(cargosAtivos);
      console.log('Estado de cargos atualizado');
    } catch (error) {
      console.error('ERRO DETALHADO ao carregar dados:', error);
      alert('Erro ao carregar dados: ' + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCargoChange = (cargo_id: string) => {
    const cargo = cargos.find(c => c.id === cargo_id);

    console.log('Cargo selecionado:', cargo);

    if (cargo) {
      // Montar requisitos formatados
      const requisitosObrigatorios = cargo.competencias?.obrigatorias || [];
      const requisitosDesejaveis = cargo.competencias?.desejaveis || [];
      const requisitosComportamentais = cargo.competencias?.comportamentais || [];

      let requisitosTexto = '';

      if (requisitosObrigatorios.length > 0) {
        requisitosTexto += '**COMPETÊNCIAS OBRIGATÓRIAS:**\n';
        requisitosTexto += requisitosObrigatorios.map(r => `• ${r}`).join('\n');
        requisitosTexto += '\n\n';
      }

      if (requisitosDesejaveis.length > 0) {
        requisitosTexto += '**COMPETÊNCIAS DESEJÁVEIS:**\n';
        requisitosTexto += requisitosDesejaveis.map(r => `• ${r}`).join('\n');
        requisitosTexto += '\n\n';
      }

      if (requisitosComportamentais.length > 0) {
        requisitosTexto += '**COMPETÊNCIAS COMPORTAMENTAIS:**\n';
        requisitosTexto += requisitosComportamentais.map(r => `• ${r}`).join('\n');
      }

      // Preencher formulário automaticamente com todos os dados do scorecard
      setFormData({
        ...formData,
        cargo_id: cargo_id,
        titulo: `Vaga: ${cargo.nome}`,
        descricao: cargo.missao || cargo.descricao,
        requisitos: requisitosTexto.trim(),
        salario_faixa: cargo.remuneracao || '',
        beneficios: cargo.beneficios_cargo || '',
        local_trabalho: 'Cuiabá - MT'
      });
    } else {
      setFormData({
        ...formData,
        cargo_id: cargo_id
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editando) {
        await vagaService.atualizar(editando.id, formData);
      } else {
        await vagaService.criar(formData as any);
      }

      await carregarDados();
      resetForm();
      alert(editando ? 'Vaga atualizada!' : 'Vaga criada!');
    } catch (error: any) {
      console.error('Erro ao salvar vaga:', error);
      alert('Erro ao salvar vaga: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      cargo_id: '',
      titulo: '',
      descricao: '',
      requisitos: '',
      local_trabalho: '',
      regime_contratual: 'CLT',
      salario_faixa: '',
      beneficios: '',
      status: 'aberta'
    });
    setEditando(null);
    setShowForm(false);
  };

  const handleEdit = (vaga: Vaga) => {
    setFormData({
      cargo_id: vaga.cargo_id,
      titulo: vaga.titulo,
      descricao: vaga.descricao,
      requisitos: vaga.requisitos,
      local_trabalho: vaga.local_trabalho || '',
      regime_contratual: vaga.regime_contratual || 'CLT',
      salario_faixa: vaga.salario_faixa || '',
      beneficios: vaga.beneficios || '',
      status: vaga.status
    });
    setEditando(vaga);
    setShowForm(true);
  };

  const handlePausar = async (id: string, status: string) => {
    try {
      const novoStatus = status === 'aberta' ? 'pausada' : 'aberta';
      await vagaService.atualizar(id, { status: novoStatus });
      await carregarDados();
    } catch (error) {
      console.error('Erro ao pausar/reabrir vaga:', error);
      alert('Erro ao alterar status da vaga');
    }
  };

  const handleFechar = async (id: string) => {
    if (!confirm('Tem certeza que deseja fechar esta vaga?')) return;

    try {
      await vagaService.fechar(id);
      await carregarDados();
    } catch (error) {
      console.error('Erro ao fechar vaga:', error);
      alert('Erro ao fechar vaga');
    }
  };

  const vagasFiltradas = vagas.filter(vaga =>
    vaga.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vaga.cargo?.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestão de Vagas</h2>
          <p className="text-white/50">Gerenciar vagas abertas e recrutamento</p>
        </div>
        <button
          onClick={() => {
            console.log('Abrindo formulário. Cargos disponíveis:', cargos.length);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] text-white rounded-lg hover:opacity-90 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nova Vaga
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/30" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar vagas..."
            className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
        >
          <option value="todas">Todas</option>
          <option value="aberta">Abertas</option>
          <option value="pausada">Pausadas</option>
          <option value="fechada">Fechadas</option>
        </select>
      </div>

      {/* Lista de Vagas */}
      {vagasFiltradas.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-xl">
          <Briefcase className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-white/50">Nenhuma vaga encontrada</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {vagasFiltradas.map((vaga) => (
            <div
              key={vaga.id}
              className="bg-[#12141f] border border-white/10 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white">{vaga.titulo}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        vaga.status === 'aberta'
                          ? 'bg-green-500/15 text-green-400'
                          : vaga.status === 'pausada'
                          ? 'bg-amber-900/30 text-amber-300'
                          : 'bg-white/10 text-white/80'
                      }`}
                    >
                      {vaga.status}
                    </span>
                  </div>
                  <p className="text-white/50 mb-3">{vaga.cargo?.nome}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-white/50">
                    {vaga.local_trabalho && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {vaga.local_trabalho}
                      </div>
                    )}
                    {vaga.salario_faixa && (
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        {vaga.salario_faixa}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {vaga.regime_contratual}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(vaga)}
                    className="p-2 text-blue-600 hover:bg-blue-500/10 rounded-lg"
                    title="Editar"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  {vaga.status !== 'fechada' && (
                    <button
                      onClick={() => handlePausar(vaga.id, vaga.status)}
                      className="p-2 text-amber-600 hover:bg-amber-500/10 rounded-lg"
                      title={vaga.status === 'aberta' ? 'Pausar' : 'Reabrir'}
                    >
                      {vaga.status === 'aberta' ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                    </button>
                  )}
                  {vaga.status !== 'fechada' && (
                    <button
                      onClick={() => handleFechar(vaga.id)}
                      className="p-2 text-red-600 hover:bg-red-500/10 rounded-lg"
                      title="Fechar"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-white/80 text-sm line-clamp-2">{vaga.descricao}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12141f] rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-2xl font-bold text-white mb-6">
              {editando ? 'Editar Vaga' : 'Nova Vaga'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Cargo *
                  </label>
                  <select
                    value={formData.cargo_id}
                    onChange={(e) => handleCargoChange(e.target.value)}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                    required
                  >
                    <option value="">Selecione um cargo</option>
                    {cargos.length === 0 && <option disabled>Carregando cargos...</option>}
                    {cargos.map((cargo) => (
                      <option key={cargo.id} value={cargo.id}>
                        {cargo.nome}
                      </option>
                    ))}
                  </select>
                  {cargos.length > 0 && (
                    <p className="text-xs text-white/40 mt-1">
                      {cargos.length} cargos disponíveis
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Título da Vaga *
                  </label>
                  <input
                    type="text"
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Descrição *
                  </label>
                  <textarea
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Requisitos *
                  </label>
                  <textarea
                    value={formData.requisitos}
                    onChange={(e) => setFormData({ ...formData, requisitos: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                    placeholder="Liste os requisitos obrigatórios e desejáveis"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Local de Trabalho
                  </label>
                  <input
                    type="text"
                    value={formData.local_trabalho}
                    onChange={(e) => setFormData({ ...formData, local_trabalho: e.target.value })}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                    placeholder="Ex: Cuiabá - MT"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Regime Contratual
                  </label>
                  <select
                    value={formData.regime_contratual}
                    onChange={(e) => setFormData({ ...formData, regime_contratual: e.target.value })}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                  >
                    <option value="CLT">CLT</option>
                    <option value="PJ">PJ</option>
                    <option value="MEI">MEI</option>
                    <option value="Temporário">Temporário</option>
                    <option value="Estágio">Estágio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Faixa Salarial
                  </label>
                  <input
                    type="text"
                    value={formData.salario_faixa}
                    onChange={(e) => setFormData({ ...formData, salario_faixa: e.target.value })}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                    placeholder="Ex: R$ 2.500 - R$ 3.500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                  >
                    <option value="aberta">Aberta</option>
                    <option value="pausada">Pausada</option>
                    <option value="fechada">Fechada</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Benefícios
                  </label>
                  <textarea
                    value={formData.beneficios}
                    onChange={(e) => setFormData({ ...formData, beneficios: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                    placeholder="Vale alimentação, plano de saúde, etc."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 border border-white/20 rounded-lg hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] text-white rounded-lg hover:opacity-90"
                >
                  {editando ? 'Salvar Alterações' : 'Criar Vaga'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestaoVagas;
