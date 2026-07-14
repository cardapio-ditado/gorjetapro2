import { supabase } from '../lib/supabase';

export interface Cargo {
  id: string;
  nome: string;
  descricao: string;
  missao: string;
  competencias: {
    obrigatorias: string[];
    desejaveis: string[];
    comportamentais?: string[];
  };
  indicadores: Array<{
    nome: string;
    meta: string;
    descricao: string;
  }>;
  status: 'ativo' | 'inativo';
  remuneracao?: string;
  beneficios_cargo?: string;
  formato_trabalho?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface Vaga {
  id: string;
  cargo_id: string;
  titulo: string;
  descricao: string;
  requisitos: string;
  local_trabalho?: string;
  regime_contratual?: string;
  salario_faixa?: string;
  beneficios?: string;
  status: 'aberta' | 'pausada' | 'fechada';
  data_abertura: string;
  data_fechamento?: string;
  criado_por?: string;
  criado_em: string;
  atualizado_em: string;
  cargo?: Cargo;
}

export interface Candidato {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  cpf?: string;
  data_nascimento?: string;
  endereco?: any;
  linkedin?: string;
  portfolio?: string;
  observacoes?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface Candidatura {
  id: string;
  vaga_id: string;
  candidato_id: string;
  curriculo_url: string;
  carta_apresentacao?: string;
  status: 'novo' | 'triagem' | 'teste' | 'entrevista' | 'finalista' | 'aprovado' | 'reprovado' | 'desistente';
  etapa_atual: 'triagem_curriculo' | 'teste_disc' | 'entrevista' | 'avaliacao_final';
  notas?: Record<string, number>;
  parecer_ia?: string;
  parecer_gestor?: string;
  recomendacao?: 'apto' | 'banco_talentos' | 'nao_recomendado';
  perfil_disc?: string;
  resumo_disc?: string;
  pontuacao_geral?: number;
  data_aplicacao: string;
  criado_em: string;
  atualizado_em: string;
  vaga?: Vaga;
  candidato?: Candidato;
}

// ============================================
// CARGOS (Scorecards)
// ============================================

export const cargoService = {
  async listar() {
    const { data, error } = await supabase
      .from('rh_cargos')
      .select('*')
      .order('nome');

    if (error) {
      console.error('Erro ao listar cargos:', error);
      throw error;
    }
    console.log('Cargos retornados do banco:', data);
    return data as Cargo[];
  },

  async buscarPorId(id: string) {
    const { data, error } = await supabase
      .from('rh_cargos')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Cargo;
  },

  async criar(cargo: Omit<Cargo, 'id' | 'criado_em' | 'atualizado_em'>) {
    const { data, error } = await supabase
      .from('rh_cargos')
      .insert(cargo)
      .select()
      .single();

    if (error) throw error;
    return data as Cargo;
  },

  async atualizar(id: string, cargo: Partial<Cargo>) {
    const { data, error } = await supabase
      .from('rh_cargos')
      .update(cargo)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Cargo;
  },

  async deletar(id: string) {
    const { error } = await supabase
      .from('rh_cargos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// ============================================
// VAGAS
// ============================================

export const vagaService = {
  async listar(status?: string) {
    let query = supabase
      .from('rh_vagas')
      .select('*, cargo:rh_cargos(*)')
      .order('data_abertura', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Vaga[];
  },

  async buscarPorId(id: string) {
    const { data, error } = await supabase
      .from('rh_vagas')
      .select('*, cargo:rh_cargos(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Vaga;
  },

  async criar(vaga: Omit<Vaga, 'id' | 'criado_em' | 'atualizado_em'>) {
    const { data, error } = await supabase
      .from('rh_vagas')
      .insert(vaga)
      .select()
      .single();

    if (error) throw error;
    return data as Vaga;
  },

  async atualizar(id: string, vaga: Partial<Vaga>) {
    const { data, error } = await supabase
      .from('rh_vagas')
      .update(vaga)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Vaga;
  },

  async fechar(id: string) {
    const { data, error } = await supabase
      .from('rh_vagas')
      .update({
        status: 'fechada',
        data_fechamento: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Vaga;
  },

  async contarCandidaturas(vaga_id: string) {
    const { count, error } = await supabase
      .from('rh_candidaturas')
      .select('*', { count: 'exact', head: true })
      .eq('vaga_id', vaga_id);

    if (error) throw error;
    return count || 0;
  }
};

// ============================================
// CANDIDATOS
// ============================================

export const candidatoService = {
  async listar() {
    const { data, error } = await supabase
      .from('rh_candidatos')
      .select('*')
      .order('nome');

    if (error) throw error;
    return data as Candidato[];
  },

  async buscarPorId(id: string) {
    const { data, error } = await supabase
      .from('rh_candidatos')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Candidato;
  },

  async buscarPorEmail(email: string) {
    const { data, error } = await supabase
      .from('rh_candidatos')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    return data as Candidato | null;
  },

  async criar(candidato: Omit<Candidato, 'id' | 'criado_em' | 'atualizado_em'>) {
    const { data, error } = await supabase
      .from('rh_candidatos')
      .insert(candidato)
      .select()
      .single();

    if (error) throw error;
    return data as Candidato;
  },

  async atualizar(id: string, candidato: Partial<Candidato>) {
    const { data, error } = await supabase
      .from('rh_candidatos')
      .update(candidato)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Candidato;
  }
};

// ============================================
// CANDIDATURAS
// ============================================

export const candidaturaService = {
  async listar(vaga_id?: string, status?: string) {
    let query = supabase
      .from('rh_candidaturas')
      .select('*, vaga:rh_vagas(*, cargo:rh_cargos(*)), candidato:rh_candidatos(*)')
      .order('data_aplicacao', { ascending: false });

    if (vaga_id) {
      query = query.eq('vaga_id', vaga_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Candidatura[];
  },

  async buscarPorId(id: string) {
    const { data, error } = await supabase
      .from('rh_candidaturas')
      .select('*, vaga:rh_vagas(*, cargo:rh_cargos(*)), candidato:rh_candidatos(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Candidatura;
  },

  async criar(candidatura: Omit<Candidatura, 'id' | 'criado_em' | 'atualizado_em' | 'data_aplicacao'>) {
    const { data, error } = await supabase
      .from('rh_candidaturas')
      .insert(candidatura)
      .select()
      .single();

    if (error) throw error;
    return data as Candidatura;
  },

  async atualizar(id: string, candidatura: Partial<Candidatura>) {
    const { data, error } = await supabase
      .from('rh_candidaturas')
      .update(candidatura)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Candidatura;
  },

  async analisarComIA(candidatura_id: string, curriculo_texto: string) {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analisar-curriculo-ia`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidatura_id,
        curriculo_texto
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao analisar currículo');
    }

    return await response.json();
  },

  async uploadCurriculo(file: File): Promise<string> {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `curriculos/${fileName}`;

    const { error } = await supabase.storage
      .from('rh')
      .upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage
      .from('rh')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }
};

// ============================================
// ESTATÍSTICAS
// ============================================

export const rhDashboardService = {
  async obterEstatisticas() {
    const [vagasAbertas, totalCandidaturas, candidaturasNovos, candidaturasAprovados] = await Promise.all([
      supabase.from('rh_vagas').select('*', { count: 'exact', head: true }).eq('status', 'aberta'),
      supabase.from('rh_candidaturas').select('*', { count: 'exact', head: true }),
      supabase.from('rh_candidaturas').select('*', { count: 'exact', head: true }).eq('status', 'novo'),
      supabase.from('rh_candidaturas').select('*', { count: 'exact', head: true }).eq('status', 'aprovado')
    ]);

    return {
      vagas_abertas: vagasAbertas.count || 0,
      total_candidaturas: totalCandidaturas.count || 0,
      candidaturas_novos: candidaturasNovos.count || 0,
      candidaturas_aprovados: candidaturasAprovados.count || 0
    };
  }
};
