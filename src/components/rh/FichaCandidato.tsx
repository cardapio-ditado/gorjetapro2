import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, MapPin, FileText, Calendar, Briefcase, Star, TrendingUp, Brain, MessageSquare, Mic, CreditCard as Edit, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import PreEntrevistaView from './PreEntrevistaView';
import EntrevistaPessoal from './EntrevistaPessoal';

interface FichaCandidatoProps {
  talento: any;
  onClose: () => void;
  onUpdate: () => void;
}

export default function FichaCandidato({ talento, onClose, onUpdate }: FichaCandidatoProps) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    areas_interesse: talento.areas_interesse || [],
    disponibilidade: talento.disponibilidade || '',
    pretensao_salarial: talento.pretensao_salarial || 0,
    observacoes: talento.observacoes || ''
  });
  const [candidatura, setCandidatura] = useState<any>(null);
  const [entrevistas, setEntrevistas] = useState<any[]>([]);
  const [showEntrevista, setShowEntrevista] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      // Carregar candidatura original
      if (talento.candidatura_id) {
        const { data: candData } = await supabase
          .from('rh_candidaturas')
          .select(`
            *,
            vaga:rh_vagas(*)
          `)
          .eq('id', talento.candidatura_id)
          .single();

        setCandidatura(candData);
      }

      // Carregar todas as candidaturas do candidato
      const { data: allCandidaturas } = await supabase
        .from('rh_candidaturas')
        .select('id')
        .eq('candidato_id', talento.candidato_id);

      if (allCandidaturas && allCandidaturas.length > 0) {
        // Carregar entrevistas pessoais
        const { data: entrevistasData } = await supabase
          .from('entrevistas_pessoais')
          .select('*')
          .in('candidatura_id', allCandidaturas.map(c => c.id))
          .order('data_entrevista', { ascending: false });

        setEntrevistas(entrevistasData || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('banco_talentos')
        .update({
          areas_interesse: formData.areas_interesse,
          disponibilidade: formData.disponibilidade,
          pretensao_salarial: formData.pretensao_salarial,
          observacoes: formData.observacoes
        })
        .eq('id', talento.id);

      if (error) throw error;

      alert('Informações atualizadas com sucesso!');
      setEditMode(false);
      onUpdate();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      alert('Erro ao atualizar informações');
    }
  };

  const handleAddArea = () => {
    const novaArea = prompt('Digite a área de interesse:');
    if (novaArea && novaArea.trim()) {
      setFormData({
        ...formData,
        areas_interesse: [...formData.areas_interesse, novaArea.trim()]
      });
    }
  };

  const handleRemoveArea = (index: number) => {
    setFormData({
      ...formData,
      areas_interesse: formData.areas_interesse.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-[#12141f] rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#12141f] border-b border-white/10 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <User className="w-8 h-8 text-blue-400" />
            Ficha Completa do Candidato
          </h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/50 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Informações Pessoais */}
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-6">
            <h3 className="text-xl font-bold text-white mb-4">Informações Pessoais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-white/30" />
                <div>
                  <p className="text-sm text-white/60">Nome Completo</p>
                  <p className="font-semibold text-white">{talento.candidato?.nome}</p>
                </div>
              </div>

              {talento.candidato?.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-white/30" />
                  <div>
                    <p className="text-sm text-white/60">Email</p>
                    <p className="font-semibold text-white">{talento.candidato.email}</p>
                  </div>
                </div>
              )}

              {talento.candidato?.telefone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-white/30" />
                  <div>
                    <p className="text-sm text-white/60">Telefone</p>
                    <p className="font-semibold text-white">{talento.candidato.telefone}</p>
                  </div>
                </div>
              )}

              {(talento.candidato?.cidade || talento.candidato?.estado) && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-white/30" />
                  <div>
                    <p className="text-sm text-white/60">Localização</p>
                    <p className="font-semibold text-white">
                      {talento.candidato.cidade}, {talento.candidato.estado}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Informações Profissionais */}
          <div className="bg-[#12141f] border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-blue-600" />
                Informações Profissionais
              </h3>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                >
                  <Edit className="w-4 h-4" />
                  Editar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
                  >
                    <Save className="w-4 h-4" />
                    Salvar
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Áreas de Interesse
                </label>
                {editMode ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {formData.areas_interesse.map((area, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-900/30 text-blue-300 rounded-full text-sm flex items-center gap-2"
                        >
                          {area}
                          <button
                            onClick={() => handleRemoveArea(idx)}
                            className="text-blue-300 hover:text-blue-200"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={handleAddArea}
                      className="text-sm text-blue-300 hover:text-blue-200"
                    >
                      + Adicionar área
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {formData.areas_interesse.map((area, idx) => (
                      <span key={idx} className="px-3 py-1 bg-blue-900/30 text-blue-300 rounded-full text-sm">
                        {area}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Disponibilidade
                </label>
                {editMode ? (
                  <input
                    type="text"
                    value={formData.disponibilidade}
                    onChange={(e) => setFormData({ ...formData, disponibilidade: e.target.value })}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Imediata, 30 dias..."
                  />
                ) : (
                  <p className="text-white">{formData.disponibilidade || 'Não informado'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Pretensão Salarial
                </label>
                {editMode ? (
                  <input
                    type="number"
                    value={formData.pretensao_salarial}
                    onChange={(e) => setFormData({ ...formData, pretensao_salarial: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                ) : (
                  <p className="text-white">
                    {formData.pretensao_salarial
                      ? `R$ ${formData.pretensao_salarial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : 'Não informado'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Observações
                </label>
                {editMode ? (
                  <textarea
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Observações sobre o candidato..."
                  />
                ) : (
                  <p className="text-white whitespace-pre-wrap">{formData.observacoes || 'Nenhuma observação'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Currículo */}
          {talento.candidato?.curriculo_texto && (
            <div className="bg-[#12141f] border border-white/10 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-400" />
                Currículo
              </h3>
              <div className="bg-white/5 rounded-lg p-4 max-h-64 overflow-y-auto">
                <p className="text-white/90 whitespace-pre-wrap text-sm">
                  {talento.candidato.curriculo_texto}
                </p>
              </div>
            </div>
          )}

          {/* Pré-Entrevista */}
          {candidatura && (
            <div className="bg-[#12141f] border border-white/10 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-blue-400" />
                Pré-Entrevista IA
              </h3>
              <PreEntrevistaView candidatura_id={candidatura.id} />
            </div>
          )}

          {/* Entrevistas Pessoais */}
          <div className="bg-[#12141f] border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Mic className="w-6 h-6 text-blue-400" />
                Entrevistas Pessoais ({entrevistas.length})
              </h3>
              {candidatura && (
                <button
                  onClick={() => setShowEntrevista(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <Mic className="w-4 h-4" />
                  Nova Entrevista
                </button>
              )}
            </div>

            {entrevistas.length === 0 ? (
              <p className="text-white/50 text-center py-4">Nenhuma entrevista pessoal realizada</p>
            ) : (
              <div className="space-y-4">
                {entrevistas.map((entrevista) => (
                  <div key={entrevista.id} className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-white">{entrevista.cargo_avaliado}</p>
                        <p className="text-sm text-white/50">
                          {new Date(entrevista.data_entrevista).toLocaleString('pt-BR')}
                        </p>
                        {entrevista.entrevistador && (
                          <p className="text-sm text-white/50">Entrevistador: {entrevista.entrevistador}</p>
                        )}
                      </div>
                      {entrevista.pontuacao && (
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-400">{entrevista.pontuacao}/100</p>
                          <p className="text-xs text-white/50">Pontuação</p>
                        </div>
                      )}
                    </div>

                    {entrevista.notas_entrevistador && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-white/80 mb-1">Notas:</p>
                        <p className="text-sm text-white/50">{entrevista.notas_entrevistador}</p>
                      </div>
                    )}

                    {entrevista.analise_ia && (
                      <div className="bg-[#12141f] rounded p-3 space-y-2">
                        <p className="text-sm font-medium text-white/80">Análise IA:</p>
                        {entrevista.analise_ia.resumo && (
                          <p className="text-sm text-white/50">{entrevista.analise_ia.resumo}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Calendar className="w-4 h-4" />
              <span>
                Incluído no banco de talentos em {new Date(talento.data_inclusao).toLocaleString('pt-BR')}
              </span>
            </div>
            {talento.motivo_inclusao && (
              <p className="text-sm text-white/50 mt-2">
                <strong>Motivo:</strong> {talento.motivo_inclusao}
              </p>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-[#12141f] border-t border-white/10 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {showEntrevista && candidatura && (
        <EntrevistaPessoal
          candidatura_id={candidatura.id}
          onClose={() => {
            setShowEntrevista(false);
            carregarDados();
          }}
        />
      )}
    </div>
  );
}
