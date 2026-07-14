import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import GerenciamentoUsuarios from '../components/admin/GerenciamentoUsuarios';
import { supabase } from '../lib/supabase';
import {
  User,
  Lock,
  Bell,
  Globe,
  CreditCard,
  Tag,
  UserCog,
  ShieldCheck,
  Bot,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  Settings as SettingsIcon
} from 'lucide-react';
import { PageLayout } from '../components/layout';

const Settings: React.FC = () => {
  const { isMaster, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  // Estados para configurações de IA
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
  const [iaHabilitada, setIaHabilitada] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (activeTab === 'ia') {
      carregarConfiguracoesIA();
    }
  }, [activeTab]);

  const carregarConfiguracoesIA = async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['openai_api_key', 'openai_model', 'ia_habilitada']);

      if (error) throw error;

      data?.forEach((config: any) => {
        switch (config.chave) {
          case 'openai_api_key':
            setOpenaiApiKey(config.valor || '');
            break;
          case 'openai_model':
            setOpenaiModel(config.valor || 'gpt-4o-mini');
            break;
          case 'ia_habilitada':
            setIaHabilitada(config.valor === 'true');
            break;
        }
      });
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  };

  const salvarConfiguracoesIA = async () => {
    setLoading(true);
    setSuccessMessage('');

    try {
      // Atualizar configurações usando service role
      const { error } = await supabase.rpc('atualizar_configuracao_sistema', {
        p_chave: 'openai_api_key',
        p_valor: openaiApiKey
      });

      if (error) throw error;

      await supabase.rpc('atualizar_configuracao_sistema', {
        p_chave: 'openai_model',
        p_valor: openaiModel
      });

      await supabase.rpc('atualizar_configuracao_sistema', {
        p_chave: 'ia_habilitada',
        p_valor: iaHabilitada ? 'true' : 'false'
      });

      setSuccessMessage('Configurações salvas com sucesso!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar configurações. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <PageLayout
      title="Configurações do Sistema"
      description="Gerencie preferências, segurança e integrações"
      icon={SettingsIcon}
      breadcrumb={['Sistema', 'Configurações']}
      variant="wine"
    >
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="md:w-64 flex-shrink-0">
          <div className="bg-[#12141f] rounded-lg overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-medium text-white/90">Configurações</h3>
            </div>
            <nav className="p-2">
              <button
                className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'profile' 
                    ? 'bg-[#7D1F2C] text-white' 
                    : 'text-white/60 hover:bg-[#7D1F2C] hover:bg-opacity-10 hover:text-[#7D1F2C]'
                }`}
                onClick={() => setActiveTab('profile')}
              >
                <User className="w-5 h-5 mr-3" />
                Perfil
              </button>
              <button
                className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'security' 
                    ? 'bg-[#7D1F2C] text-white' 
                    : 'text-white/60 hover:bg-[#7D1F2C] hover:bg-opacity-10 hover:text-[#7D1F2C]'
                }`}
                onClick={() => setActiveTab('security')}
              >
                <Lock className="w-5 h-5 mr-3" />
                Segurança
              </button>
              <button
                className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'notifications' 
                    ? 'bg-[#7D1F2C] text-white' 
                    : 'text-white/60 hover:bg-[#7D1F2C] hover:bg-opacity-10 hover:text-[#7D1F2C]'
                }`}
                onClick={() => setActiveTab('notifications')}
              >
                <Bell className="w-5 h-5 mr-3" />
                Notificações
              </button>
              {isMaster() && (
                <button
                  className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'users' 
                      ? 'bg-[#7D1F2C] text-white' 
                      : 'text-white/60 hover:bg-[#7D1F2C] hover:bg-opacity-10 hover:text-[#7D1F2C]'
                  }`}
                  onClick={() => setActiveTab('users')}
                >
                  <UserCog className="w-5 h-5 mr-3" />
                  Usuários
                </button>
              )}
              {isAdmin() && <button
                className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'payment'
                    ? 'bg-[#7D1F2C] text-white'
                    : 'text-white/60 hover:bg-[#7D1F2C] hover:bg-opacity-10 hover:text-[#7D1F2C]'
                }`}
                onClick={() => setActiveTab('payment')}
              >
                <CreditCard className="w-5 h-5 mr-3" />
                Pagamentos
              </button>}
              {isMaster() && (
                <button
                  className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'ia'
                      ? 'bg-[#7D1F2C] text-white'
                      : 'text-white/60 hover:bg-[#7D1F2C] hover:bg-opacity-10 hover:text-[#7D1F2C]'
                  }`}
                  onClick={() => setActiveTab('ia')}
                >
                  <Bot className="w-5 h-5 mr-3" />
                  Inteligência Artificial
                </button>
              )}
              <button
                className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'global'
                    ? 'bg-[#7D1F2C] text-white'
                    : 'text-white/60 hover:bg-[#7D1F2C] hover:bg-opacity-10 hover:text-[#7D1F2C]'
                }`}
                onClick={() => setActiveTab('global')}
              >
                <Globe className="w-5 h-5 mr-3" />
                Geral
              </button>
            </nav>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1">
          <div className="bg-[#12141f] rounded-lg">
            {activeTab === 'profile' && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-white/90 mb-4">Perfil</h3>
                
                <div className="mb-6 flex items-center">
                  <div className="w-24 h-24 rounded-full bg-[#7D1F2C] flex items-center justify-center text-white text-2xl mr-6">
                    AS
                  </div>
                  <div>
                    <button className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#5a1720] transition-colors duration-200 mb-2">
                      Alterar foto
                    </button>
                    <p className="text-sm text-white/40">
                      JPG, GIF ou PNG. Tamanho máximo de 2MB.
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">
                        Nome
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                        defaultValue="Ana"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">
                        Sobrenome
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                        defaultValue="Silva"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      defaultValue="ana.silva@ditadopopular.com"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      defaultValue="(11) 99876-5432"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">
                      Cargo
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      defaultValue="Gerente"
                      readOnly
                    />
                  </div>
                  
                  <div className="pt-4 flex justify-end">
                    <button className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#5a1720] transition-colors duration-200">
                      Salvar alterações
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'security' && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-white/90 mb-4">Segurança</h3>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-md font-medium text-white/80 mb-3 flex items-center">
                      <ShieldCheck className="w-5 h-5 mr-2 text-[#7D1F2C]" />
                      Alterar senha
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-white/80 mb-1">
                          Senha atual
                        </label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                          placeholder="••••••••"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/80 mb-1">
                          Nova senha
                        </label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                          placeholder="••••••••"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/80 mb-1">
                          Confirmar nova senha
                        </label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 bg-[#12141f]/5 border border-white/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="pt-2">
                        <button className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#5a1720] transition-colors duration-200">
                          Atualizar senha
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-white/10">
                    <h4 className="text-md font-medium text-white/80 mb-3">Verificação em duas etapas</h4>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white/60">
                          Adicione uma camada extra de segurança à sua conta.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" value="" className="sr-only peer" />
                        <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7D1F2C] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#12141f] after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7D1F2C]"></div>
                      </label>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-white/10">
                    <h4 className="text-md font-medium text-white/80 mb-3">Dispositivos conectados</h4>
                    <div className="space-y-3">
                      <div className="p-3 bg-[#12141f]/5 rounded-md border border-white/10 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-white/90">MacBook Pro - São Paulo</p>
                          <p className="text-xs text-white/40">Último acesso: Hoje, 15:45</p>
                        </div>
                        <button className="text-sm text-red-500 hover:text-red-400">
                          Desconectar
                        </button>
                      </div>
                      <div className="p-3 bg-[#12141f]/5 rounded-md border border-white/10 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-white/90">iPhone 14 - São Paulo</p>
                          <p className="text-xs text-white/40">Último acesso: Ontem, 19:30</p>
                        </div>
                        <button className="text-sm text-red-500 hover:text-red-400">
                          Desconectar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'notifications' && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-white/90 mb-4">Notificações</h3>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-md font-medium text-white/80 mb-3">Email</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <div>
                          <p className="font-medium text-white/90">Notificações financeiras</p>
                          <p className="text-xs text-white/40">Receba alertas sobre pagamentos e relatórios financeiros</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" value="" className="sr-only peer" checked />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7D1F2C] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#12141f] after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7D1F2C]"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <div>
                          <p className="font-medium text-white/90">Alertas de estoque</p>
                          <p className="text-xs text-white/40">Receba alertas quando produtos estiverem abaixo do estoque mínimo</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" value="" className="sr-only peer" checked />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7D1F2C] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#12141f] after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7D1F2C]"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <div>
                          <p className="font-medium text-white/90">Escalas de funcionários</p>
                          <p className="text-xs text-white/40">Receba notificações sobre mudanças nas escalas</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" value="" className="sr-only peer" />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7D1F2C] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#12141f] after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7D1F2C]"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-md font-medium text-white/80 mb-3">Push</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <div>
                          <p className="font-medium text-white/90">Eventos próximos</p>
                          <p className="text-xs text-white/40">Receba lembretes de eventos que acontecerão em breve</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" value="" className="sr-only peer" checked />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7D1F2C] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#12141f] after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7D1F2C]"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <div>
                          <p className="font-medium text-white/90">Novas reservas</p>
                          <p className="text-xs text-white/40">Receba notificações quando houver novas reservas</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" value="" className="sr-only peer" checked />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#7D1F2C] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#12141f] after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7D1F2C]"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 flex justify-end">
                    <button className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#5a1720] transition-colors duration-200">
                      Salvar preferências
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'users' && (
              <ProtectedRoute moduloSlug="settings" acao="editar">
                <GerenciamentoUsuarios />
              </ProtectedRoute>
            )}
            
            {/* Configurações de IA */}
            {activeTab === 'ia' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-medium text-white/90 flex items-center">
                      <Bot className="w-6 h-6 mr-2 text-blue-400" />
                      Configurações de Inteligência Artificial
                    </h3>
                    <p className="text-sm text-white/60 mt-1">
                      Configure a integração com OpenAI para o Super Agente IA
                    </p>
                  </div>
                  {successMessage && (
                    <div className="flex items-center text-green-400 bg-green-500/10 px-4 py-2 rounded-lg">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      {successMessage}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Habilitar IA */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={iaHabilitada}
                        onChange={(e) => setIaHabilitada(e.target.checked)}
                        className="w-5 h-5 text-blue-400 border-white/20 rounded focus:ring-blue-500"
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-white">
                          Habilitar funcionalidades de IA
                        </span>
                        <p className="text-xs text-white/60 mt-1">
                          Ative para usar o Super Agente IA com processamento de linguagem natural
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* API Key da OpenAI */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Chave de API da OpenAI
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full px-4 py-2 pr-12 bg-[#12141f]/5 border border-white/20 rounded-lg text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-white/40 mt-2">
                      Obtenha sua chave em{' '}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        platform.openai.com/api-keys
                      </a>
                    </p>
                  </div>

                  {/* Modelo */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Modelo da OpenAI
                    </label>
                    <select
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      className="w-full px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                    >
                      <option value="gpt-4o-mini">GPT-4o Mini (Rápido e econômico)</option>
                      <option value="gpt-4o">GPT-4o (Melhor performance)</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Mais barato)</option>
                    </select>
                    <p className="text-xs text-white/40 mt-2">
                      <strong>Recomendado:</strong> GPT-4o Mini oferece ótimo custo-benefício
                    </p>
                  </div>

                  {/* Info Box */}
                  <div className="bg-[#12141f]/5 border border-white/10 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-white mb-2">
                      💡 Como funciona o Super Agente IA
                    </h4>
                    <ul className="text-xs text-white/60 space-y-1">
                      <li>• Processa suas perguntas em linguagem natural</li>
                      <li>• Acessa dados do sistema em tempo real (compras, estoque, RH, financeiro)</li>
                      <li>• Gera respostas contextualizadas e humanizadas</li>
                      <li>• Mantém histórico de conversas para contexto contínuo</li>
                    </ul>
                  </div>

                  {/* Botão Salvar */}
                  <div className="flex justify-end pt-4 border-t">
                    <button
                      onClick={salvarConfiguracoesIA}
                      disabled={loading || !openaiApiKey}
                      className="flex items-center px-6 py-2.5 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save className="w-5 h-5 mr-2" />
                      {loading ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Show placeholder for other tabs */}
            {!['profile', 'security', 'notifications', 'users', 'ia'].includes(activeTab) && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-white/90 mb-4">
                  {activeTab === 'payment' && 'Configurações de Pagamento'}
                  {activeTab === 'global' && 'Configurações Gerais'}
                </h3>
                <div className="py-8 flex items-center justify-center">
                  <p className="text-white/40">Conteúdo em desenvolvimento</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default Settings;