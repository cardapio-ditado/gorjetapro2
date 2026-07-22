import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, EyeOff, Shield, User, Users, Settings, CheckCircle, XCircle, Crown, Star, AlertTriangle, Download, FileText, Lock, Unlock, Calendar, Mail, Phone, Briefcase, Building } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import GerenciamentoPermissoes from './GerenciamentoPermissoes';
import { useAuth } from '../../contexts/AuthContext';
import { exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';

interface UsuarioSistema {
  id: string;
  nome_completo: string;
  email: string;
  nivel: 'master' | 'admin' | 'usuario' | 'visitante';
  ativo: boolean;
  ultimo_acesso?: string;
  foto_url?: string;
  telefone?: string;
  cargo?: string;
  departamento?: string;
  data_admissao?: string;
  configuracoes?: any;
  criado_em: string;
  atualizado_em: string;
  // Dados da view
  total_modulos_permitidos?: number;
  total_abas_permitidas?: number;
  abas_com_criacao?: number;
  abas_com_edicao?: number;
  abas_com_exclusao?: number;
  abas_com_aprovacao?: number;
}

interface FormData {
  nome_completo: string;
  email: string;
  nivel: 'master' | 'admin' | 'usuario' | 'visitante';
  telefone: string;
  cargo: string;
  departamento: string;
  data_admissao: string;
  ativo: boolean;
  // Só usado ao CRIAR (nivel 'usuario') — vira auth_pre_cadastro.modulos_permitidos
  modulosPermitidos: string[];
  // Só usado ao CRIAR — senha provisória, obrigatoriamente trocada no 1º acesso
  senhaProvisoria: string;
}

// Gera senha provisória aleatória (crypto-safe) para o admin repassar à pessoa
function gerarSenhaProvisoria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alfabeto[b % alfabeto.length]).join('');
}

interface ModuloOpcao { id: string; slug: string; nome: string; }

interface IndicadoresUsuarios {
  total_usuarios: number;
  usuarios_ativos: number;
  usuarios_inativos: number;
  masters: number;
  admins: number;
  usuarios_comuns: number;
  visitantes: number;
  ultimo_login?: string;
}

const GerenciamentoUsuarios: React.FC = () => {
  const { isMaster, usuario: usuarioLogado } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresUsuarios | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<UsuarioSistema | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [usuarioPermissoes, setUsuarioPermissoes] = useState<UsuarioSistema | null>(null);
  const { refreshPermissoes } = useAuth();
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [nivelFilter, setNivelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all');
  const [departamentoFilter, setDepartamentoFilter] = useState('all');
  
  const [formData, setFormData] = useState<FormData>({
    nome_completo: '',
    email: '',
    nivel: 'usuario',
    telefone: '',
    cargo: '',
    departamento: 'Operacional',
    data_admissao: dayjs().format('YYYY-MM-DD'),
    ativo: true,
    modulosPermitidos: [],
    senhaProvisoria: gerarSenhaProvisoria()
  });
  const [modulosDisponiveis, setModulosDisponiveis] = useState<ModuloOpcao[]>([]);
  const [avisoConvite, setAvisoConvite] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(true);

  const departamentos = [
    'Administração', 'Operacional', 'Cozinha', 'Bar', 'Eventos', 
    'Segurança', 'Limpeza', 'RH', 'Financeiro', 'TI'
  ];

  useEffect(() => {
    if (isMaster()) {
      fetchData();
      fetchIndicadores();
      fetchModulos();
    }
  }, []);

  useEffect(() => {
    if (isMaster()) {
      fetchData();
    }
  }, [nivelFilter, statusFilter, departamentoFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase.from('vw_usuarios_permissoes').select('*');

      // Aplicar filtros
      if (nivelFilter !== 'all') {
        query = query.eq('nivel', nivelFilter);
      }

      if (statusFilter !== 'all') {
        query = query.eq('ativo', statusFilter === 'ativo');
      }

      if (departamentoFilter !== 'all') {
        query = query.eq('departamento', departamentoFilter);
      }

      const { data, error } = await query.order('criado_em', { ascending: false });

      if (error) throw error;
      setUsuarios(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios_sistema')
        .select('*');

      if (error) throw error;

      const totalUsuarios = (data || []).length;
      const usuariosAtivos = (data || []).filter(u => u.ativo).length;
      const usuariosInativos = totalUsuarios - usuariosAtivos;
      const masters = (data || []).filter(u => u.nivel === 'master').length;
      const admins = (data || []).filter(u => u.nivel === 'admin').length;
      const usuariosComuns = (data || []).filter(u => u.nivel === 'usuario').length;
      const visitantes = (data || []).filter(u => u.nivel === 'visitante').length;
      
      // Encontrar último login
      const ultimoLogin = (data || [])
        .filter(u => u.ultimo_acesso)
        .sort((a, b) => dayjs(b.ultimo_acesso).diff(dayjs(a.ultimo_acesso)))[0];

      setIndicadores({
        total_usuarios: totalUsuarios,
        usuarios_ativos: usuariosAtivos,
        usuarios_inativos: usuariosInativos,
        masters,
        admins,
        usuarios_comuns: usuariosComuns,
        visitantes,
        ultimo_login: ultimoLogin?.ultimo_acesso
      });
    } catch (err) {
      console.error('Error fetching indicators:', err);
    }
  };

  /**
   * REGRA DE OURO: a única credencial de verdade é a do Supabase Auth.
   * Este painel nunca lê/grava senha em tabela — a senha provisória digitada
   * aqui só viaja (HTTPS) até a edge function admin-criar-usuario, que roda
   * no servidor com a service_role key (nunca exposta ao cliente) e chama
   * supabase.auth.admin.createUser(). A conta nasce com
   * precisa_trocar_senha=true, forçando a troca em /redefinir-senha — mesmo
   * mecanismo (auth.updateUser) usado pelo link de convite/recuperação.
   */
  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      setAvisoConvite(null);

      if (!formData.nome_completo || !formData.email) {
        throw new Error('Nome e email são obrigatórios');
      }

      if (!editingUsuario && formData.senhaProvisoria.length < 8) {
        throw new Error('A senha provisória precisa ter pelo menos 8 caracteres.');
      }

      const dataToSave = {
        nome_completo: formData.nome_completo,
        nivel: formData.nivel,
        telefone: formData.telefone,
        cargo: formData.cargo,
        departamento: formData.departamento,
        data_admissao: formData.data_admissao,
        ativo: formData.ativo,
      };

      if (editingUsuario) {
        // Não permitir que usuário altere seu próprio nível ou desative a si mesmo
        if (editingUsuario.id === usuarioLogado?.id) {
          if (dataToSave.nivel !== editingUsuario.nivel) {
            throw new Error('Você não pode alterar seu próprio nível de acesso');
          }
          if (!dataToSave.ativo) {
            throw new Error('Você não pode desativar sua própria conta');
          }
        }

        const { error } = await supabase
          .from('usuarios_sistema')
          .update({ ...dataToSave, atualizado_em: new Date().toISOString() })
          .eq('id', editingUsuario.id);

        if (error) throw error;
      } else {
        // Já existe conta ativa (vinculada ao Auth) com este email?
        const { data: existente } = await supabase
          .from('usuarios_sistema')
          .select('id')
          .ilike('email', formData.email)
          .maybeSingle();

        if (existente) {
          throw new Error('Já existe uma conta com este email. Edite o usuário existente em vez de criar um novo.');
        }

        const modulos = formData.nivel === 'usuario'
          ? Array.from(new Set(['dashboard', ...formData.modulosPermitidos]))
          : null; // admin/master recebem acesso completo automaticamente

        const { data: preExistente } = await supabase
          .from('auth_pre_cadastro')
          .select('email, utilizado')
          .ilike('email', formData.email)
          .maybeSingle();

        if (preExistente?.utilizado) {
          throw new Error('Este email já foi usado para ativar uma conta. Verifique em Usuários.');
        }

        const preCadastro = {
          email: formData.email,
          nome_completo: formData.nome_completo,
          nivel: formData.nivel,
          cargo: formData.cargo || null,
          departamento: formData.departamento || null,
          modulos_permitidos: modulos,
        };

        const { error: preError } = preExistente
          ? await supabase.from('auth_pre_cadastro').update(preCadastro).ilike('email', formData.email)
          : await supabase.from('auth_pre_cadastro').insert([preCadastro]);

        if (preError) throw preError;

        // Cria a conta de verdade no Supabase Auth com a senha provisória
        // (roda no servidor — service_role nunca chega ao navegador).
        const { data: criacao, error: fnError } = await supabase.functions.invoke('admin-criar-usuario', {
          body: { email: formData.email, senha: formData.senhaProvisoria },
        });

        if (fnError) throw new Error(fnError.message || 'Falha ao criar a conta de acesso.');
        if (criacao && criacao.ok === false) throw new Error(criacao.error || 'Falha ao criar a conta de acesso.');

        setAvisoConvite(
          `Conta de ${formData.nome_completo} criada. Senha provisória: "${formData.senhaProvisoria}" — repasse ` +
          `para a pessoa (WhatsApp, verbal, etc). Ela será obrigada a trocar a senha no primeiro acesso.`
        );
      }

      setShowForm(false);
      setEditingUsuario(null);
      resetForm();
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar usuário');
    } finally {
      setLoading(false);
    }
  };

  const fetchModulos = async () => {
    const { data, error } = await supabase
      .from('modulos_sistema')
      .select('id, slug, nome')
      .eq('ativo', true)
      .neq('slug', 'dashboard')
      .order('nome');
    if (!error) setModulosDisponiveis((data as ModuloOpcao[]) || []);
  };

  const toggleModuloPermitido = (slug: string) => {
    setFormData(prev => ({
      ...prev,
      modulosPermitidos: prev.modulosPermitidos.includes(slug)
        ? prev.modulosPermitidos.filter(s => s !== slug)
        : [...prev.modulosPermitidos, slug],
    }));
  };

  const handleDelete = async (id: string) => {
    if (id === usuarioLogado?.id) {
      alert('Você não pode excluir sua própria conta');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('usuarios_sistema')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (usuario: UsuarioSistema) => {
    if (usuario.id === usuarioLogado?.id) {
      alert('Você não pode desativar sua própria conta');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('usuarios_sistema')
        .update({ 
          ativo: !usuario.ativo,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', usuario.id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (usuario?: UsuarioSistema) => {
    setAvisoConvite(null);
    if (usuario) {
      setEditingUsuario(usuario);
      setFormData({
        nome_completo: usuario.nome_completo,
        email: usuario.email,
        nivel: usuario.nivel,
        telefone: usuario.telefone || '',
        cargo: usuario.cargo || '',
        departamento: usuario.departamento || 'Operacional',
        data_admissao: usuario.data_admissao || dayjs().format('YYYY-MM-DD'),
        ativo: usuario.ativo,
        modulosPermitidos: [],
        senhaProvisoria: ''
      });
    } else {
      setEditingUsuario(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome_completo: '',
      email: '',
      nivel: 'usuario',
      telefone: '',
      cargo: '',
      departamento: 'Operacional',
      data_admissao: dayjs().format('YYYY-MM-DD'),
      ativo: true,
      modulosPermitidos: [],
      senhaProvisoria: gerarSenhaProvisoria()
    });
  };

  const openPermissionsModal = (usuario: UsuarioSistema) => {
    setUsuarioPermissoes(usuario);
    setShowPermissionsModal(true);
  };

  const filteredUsuarios = usuarios.filter(usuario => {
    const matchesSearch = usuario.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         usuario.cargo?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getNivelColor = (nivel: string) => {
    switch (nivel) {
      case 'master':
        return 'text-red-300 bg-red-900/30 border border-red-200';
      case 'admin':
        return 'text-purple-300 bg-purple-900/30 border border-purple-200';
      case 'usuario':
        return 'text-blue-300 bg-blue-900/30 border border-blue-200';
      case 'visitante':
        return 'text-white/50 bg-white/10 border border-white/10';
      default:
        return 'text-white/50 bg-white/10 border border-white/10';
    }
  };

  const getNivelIcon = (nivel: string) => {
    switch (nivel) {
      case 'master':
        return <Crown className="w-4 h-4" />;
      case 'admin':
        return <Star className="w-4 h-4" />;
      case 'usuario':
        return <User className="w-4 h-4" />;
      case 'visitante':
        return <Eye className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  const getNivelText = (nivel: string) => {
    switch (nivel) {
      case 'master':
        return 'Master';
      case 'admin':
        return 'Administrador';
      case 'usuario':
        return 'Usuário';
      case 'visitante':
        return 'Visitante';
      default:
        return nivel;
    }
  };

  const exportData = () => {
    if (filteredUsuarios.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Nome Completo',
      'Email',
      'Nível',
      'Cargo',
      'Departamento',
      'Data Admissão',
      'Status',
      'Último Acesso',
      'Módulos Permitidos',
      'Abas Permitidas'
    ];

    const data = filteredUsuarios.map(usuario => [
      usuario.nome_completo,
      usuario.email,
      getNivelText(usuario.nivel),
      usuario.cargo || '',
      usuario.departamento || '',
      usuario.data_admissao ? dayjs(usuario.data_admissao).format('DD/MM/YYYY') : '',
      usuario.ativo ? 'Ativo' : 'Inativo',
      usuario.ultimo_acesso ? dayjs(usuario.ultimo_acesso).format('DD/MM/YYYY HH:mm') : 'Nunca',
      usuario.total_modulos_permitidos || 0,
      usuario.total_abas_permitidas || 0
    ]);

    const fileName = `usuarios-sistema-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  // Verificar se é master
  if (!isMaster()) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Acesso Negado</h3>
          <p className="text-white/50">
            Apenas usuários com nível Master podem gerenciar usuários do sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Gerenciamento de Usuários</h3>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="px-4 py-2 bg-white border border-white/20 bg-white/5 rounded-lg text-white/80 hover:bg-white/5"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar Excel
          </button>
          <button
            onClick={() => openForm()}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Novo Usuário
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {avisoConvite && (
        <div className="p-4 bg-blue-900/30 text-blue-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{avisoConvite}</span>
        </div>
      )}

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Usuários</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.total_usuarios}
                </p>
                <p className="text-sm text-white/70">
                  {indicadores.usuarios_ativos} ativos
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <Crown className="w-8 h-8 text-red-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Masters & Admins</p>
                <p className="text-2xl font-bold text-red-400">
                  {indicadores.masters + indicadores.admins}
                </p>
                <p className="text-sm text-white/70">
                  {indicadores.masters} masters, {indicadores.admins} admins
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <User className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Usuários Comuns</p>
                <p className="text-2xl font-bold text-green-400">
                  {indicadores.usuarios_comuns}
                </p>
                <p className="text-sm text-white/70">
                  {indicadores.visitantes} visitantes
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-purple-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Último Acesso</p>
                <p className="text-lg font-bold text-purple-400">
                  {indicadores.ultimo_login ? dayjs(indicadores.ultimo_login).format('DD/MM/YYYY') : 'N/A'}
                </p>
                <p className="text-sm text-white/70">
                  {indicadores.ultimo_login ? dayjs(indicadores.ultimo_login).format('HH:mm') : 'Nenhum acesso'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg shadow-sm border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div>
            <select
              value={nivelFilter}
              onChange={(e) => setNivelFilter(e.target.value)}
              className="w-full border border-white/20 bg-white/5 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Níveis</option>
              <option value="master">Master</option>
              <option value="admin">Administrador</option>
              <option value="usuario">Usuário</option>
              <option value="visitante">Visitante</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full border border-white/20 bg-white/5 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Status</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div>
            <select
              value={departamentoFilter}
              onChange={(e) => setDepartamentoFilter(e.target.value)}
              className="w-full border border-white/20 bg-white/5 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Departamentos</option>
              {departamentos.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              onClick={fetchData}
              className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
            >
              <Filter className="w-4 h-4 inline mr-2" />
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Usuários */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-white/5 border-b border-white/10">
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Usuário
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Nível
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Cargo/Departamento
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Permissões
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Último Acesso
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {filteredUsuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-[#7D1F2C] flex items-center justify-center text-white font-medium mr-3">
                          {usuario.nome_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-white">{usuario.nome_completo}</div>
                          <div className="text-sm text-white/50">{usuario.email}</div>
                          {usuario.telefone && (
                            <div className="text-sm text-white/50 flex items-center">
                              <Phone className="w-3 h-3 mr-1" />
                              {usuario.telefone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getNivelColor(usuario.nivel)}`}>
                        {getNivelIcon(usuario.nivel)}
                        <span className="ml-1">{getNivelText(usuario.nivel)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        {usuario.cargo && (
                          <div className="flex items-center text-sm text-white">
                            <Briefcase className="w-4 h-4 mr-1 text-white/30" />
                            {usuario.cargo}
                          </div>
                        )}
                        {usuario.departamento && (
                          <div className="flex items-center text-sm text-white/50">
                            <Building className="w-4 h-4 mr-1 text-white/30" />
                            {usuario.departamento}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="text-white">
                          {usuario.total_modulos_permitidos || 0} módulos
                        </div>
                        <div className="text-white/50">
                          {usuario.total_abas_permitidas || 0} abas
                        </div>
                        <div className="flex space-x-1 mt-1">
                          {(usuario.abas_com_criacao || 0) > 0 && (
                            <span className="text-xs bg-green-500/15 text-green-400 px-1 rounded">
                              C: {usuario.abas_com_criacao}
                            </span>
                          )}
                          {(usuario.abas_com_edicao || 0) > 0 && (
                            <span className="text-xs bg-blue-500/15 text-blue-400 px-1 rounded">
                              E: {usuario.abas_com_edicao}
                            </span>
                          )}
                          {(usuario.abas_com_exclusao || 0) > 0 && (
                            <span className="text-xs bg-red-500/15 text-red-400 px-1 rounded">
                              D: {usuario.abas_com_exclusao}
                            </span>
                          )}
                          {(usuario.abas_com_aprovacao || 0) > 0 && (
                            <span className="text-xs bg-purple-500/15 text-purple-400 px-1 rounded">
                              A: {usuario.abas_com_aprovacao}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        {usuario.ultimo_acesso ? (
                          <>
                            <div className="text-white">
                              {dayjs(usuario.ultimo_acesso).format('DD/MM/YYYY')}
                            </div>
                            <div className="text-white/50">
                              {dayjs(usuario.ultimo_acesso).format('HH:mm')}
                            </div>
                          </>
                        ) : (
                          <span className="text-white/30">Nunca acessou</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                        usuario.ativo ? 'text-green-300 bg-green-900/30' : 'text-red-300 bg-red-900/30'
                      }`}>
                        {usuario.ativo ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openPermissionsModal(usuario)}
                          className="text-purple-400 hover:text-purple-300"
                          title="Gerenciar Permissões"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openForm(usuario)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleStatus(usuario)}
                          className={`${usuario.ativo ? 'text-green-400' : 'text-white/30'} hover:opacity-75`}
                          title={usuario.ativo ? 'Desativar' : 'Ativar'}
                          disabled={usuario.id === usuarioLogado?.id}
                        >
                          {usuario.ativo ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(usuario.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Excluir"
                          disabled={usuario.id === usuarioLogado?.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsuarios.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhum usuário encontrado</h3>
              <p className="text-white/50">
                {searchTerm || nivelFilter !== 'all' || statusFilter !== 'all' || departamentoFilter !== 'all'
                  ? 'Nenhum usuário corresponde aos filtros aplicados.'
                  : 'Nenhum usuário cadastrado.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal do Formulário de Usuário */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className={`text-lg font-medium text-white ${editingUsuario ? 'mb-4' : 'mb-1'}`}>
              {editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}
            </h3>
            {!editingUsuario && (
              <p className="text-xs text-white/50 mb-4">
                A pessoa recebe a senha provisória abaixo e é obrigada a trocá-la no primeiro acesso.
                Nenhuma senha fica salva neste painel — a conta é criada diretamente no Supabase Auth.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.nome_completo}
                  onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                  placeholder="Nome completo do usuário"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                  disabled={!!editingUsuario}
                  placeholder="email@ditadopopular.com"
                />
              </div>

              {!editingUsuario && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Senha Provisória *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      value={formData.senhaProvisoria}
                      onChange={(e) => setFormData({ ...formData, senhaProvisoria: e.target.value })}
                      className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50 font-mono"
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(v => !v)}
                      className="px-3 rounded-md border border-white/20 bg-white/5 text-white/60 hover:bg-white/10 flex-shrink-0"
                      title={mostrarSenha ? 'Ocultar' : 'Mostrar'}
                    >
                      {mostrarSenha ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, senhaProvisoria: gerarSenhaProvisoria() })}
                      className="px-3 rounded-md border border-white/20 bg-white/5 text-white/60 hover:bg-white/10 flex-shrink-0 text-xs font-semibold"
                    >
                      Gerar
                    </button>
                  </div>
                  <p className="text-xs text-white/40 mt-1">Copie e repasse à pessoa após salvar.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Nível de Acesso *
                </label>
                <select
                  value={formData.nivel}
                  onChange={(e) => setFormData({ ...formData, nivel: e.target.value as any })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                  disabled={editingUsuario?.id === usuarioLogado?.id}
                >
                  <option value="visitante">Visitante</option>
                  <option value="usuario">Usuário</option>
                  <option value="admin">Administrador</option>
                  <option value="master">Master</option>
                </select>
                {editingUsuario?.id === usuarioLogado?.id && (
                  <p className="text-xs text-white/50 mt-1">
                    Você não pode alterar seu próprio nível
                  </p>
                )}
              </div>

              {!editingUsuario && formData.nivel === 'usuario' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Módulos liberados
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {modulosDisponiveis.map(m => {
                      const marcado = formData.modulosPermitidos.includes(m.slug);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggleModuloPermitido(m.slug)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            marcado
                              ? 'bg-[#7D1F2C] border-[#7D1F2C] text-white'
                              : 'bg-white/5 border-white/20 text-white/60 hover:bg-white/10'
                          }`}
                        >
                          {m.nome}
                        </button>
                      );
                    })}
                  </div>
                  {formData.modulosPermitidos.length === 0 && (
                    <p className="text-xs text-white/40 mt-1">Sem módulo marcado, a pessoa só verá o Dashboard.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Cargo
                </label>
                <input
                  type="text"
                  value={formData.cargo}
                  onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="Ex: Gerente, Analista, Atendente"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Departamento *
                </label>
                <select
                  value={formData.departamento}
                  onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                >
                  {departamentos.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Data de Admissão
                </label>
                <input
                  type="date"
                  value={formData.data_admissao}
                  onChange={(e) => setFormData({ ...formData, data_admissao: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={formData.ativo}
                  onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                  className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                  disabled={editingUsuario?.id === usuarioLogado?.id}
                />
                <label htmlFor="ativo" className="ml-2 text-sm text-white/80">
                  Usuário ativo
                </label>
                {editingUsuario?.id === usuarioLogado?.id && (
                  <p className="text-xs text-white/50 ml-2">
                    (Você não pode desativar sua própria conta)
                  </p>
                )}
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !formData.nome_completo || !formData.email || (!editingUsuario && formData.senhaProvisoria.length < 8)}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Permissões - TODO: Implementar componente completo */}
      {showPermissionsModal && usuarioPermissoes && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-white">
                Permissões - {usuarioPermissoes.nome_completo}
              </h3>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Fechar
              </button>
            </div>
            <GerenciamentoPermissoes
              usuarioId={usuarioPermissoes.id}
              usuarioNome={usuarioPermissoes.nome_completo}
              onClose={() => {
                setShowPermissionsModal(false);
                setUsuarioPermissoes(null);
                refreshPermissoes(); // Refresh permissions in AuthContext after saving
              }}
              onSave={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default GerenciamentoUsuarios;