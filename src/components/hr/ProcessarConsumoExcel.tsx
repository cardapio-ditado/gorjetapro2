import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Download, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ProcessarConsumoExcelProps {
  onClose: () => void;
}

interface Resultado {
  success: boolean;
  total_linhas: number;
  processadas: number;
  erros: number;
  detalhes: any[];
  erros_lista: any[];
  nao_encontrados?: any[];
}

interface ColaboradorSugestao {
  id: string;
  nome: string;
  funcao: string;
  tipo: string;
}

const ProcessarConsumoExcel: React.FC<ProcessarConsumoExcelProps> = ({ onClose }) => {
  const [processando, setProcessando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [etapaMapeamento, setEtapaMapeamento] = useState(false);
  const [mapeamentos, setMapeamentos] = useState<Record<string, string>>({});
  const [colaboradores, setColaboradores] = useState<ColaboradorSugestao[]>([]);
  const [buscaNome, setBuscaNome] = useState<Record<string, string>>({});

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setArquivo(file);
      setResultado(null);
    }
  };

  const processarArquivo = async () => {
    if (!arquivo) return;

    try {
      setProcessando(true);

      console.log('Lendo arquivo:', arquivo.name);
      const data = await arquivo.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error('Planilha vazia ou inválida');
      }

      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      console.log('Dados lidos:', jsonData.length, 'linhas');

      if (jsonData.length === 0) {
        throw new Error('Planilha não contém dados');
      }

      const linhas = jsonData.map((row: any, index: number) => {
        try {
          const keys = Object.keys(row);
          const funcionarioKey = keys.find(k =>
            k.toLowerCase().includes('funcionario') ||
            k.toLowerCase().includes('nome') ||
            k.toLowerCase().includes('colaborador')
          );
          const dataKey = keys.find(k => k.toLowerCase().includes('data'));
          const valorKey = keys.find(k =>
            k.toLowerCase().includes('valor') ||
            k.toLowerCase().includes('consumo') ||
            k.toLowerCase().includes('desconto')
          );

          if (!funcionarioKey) {
            console.warn(`Linha ${index + 1}: Coluna de funcionário não encontrada. Colunas: ${keys.join(', ')}`);
            return null;
          }

          if (!valorKey) {
            console.warn(`Linha ${index + 1}: Coluna de valor não encontrada. Colunas: ${keys.join(', ')}`);
            return null;
          }

          const dataOriginal = row[dataKey!];
          const dataFormatada = formatarData(dataOriginal);

          console.log(`Linha ${index + 1}: data original = "${dataOriginal}", formatada = "${dataFormatada}"`);

          return {
            funcionario: row[funcionarioKey]?.toString().trim(),
            data: dataFormatada,
            valor: parseFloat(row[valorKey]) || 0,
          };
        } catch (err) {
          console.error(`Erro ao processar linha ${index + 1}:`, err);
          return null;
        }
      }).filter(l => l && l.funcionario && l.data && l.valor > 0);

      console.log('Linhas válidas após filtro:', linhas.length);

      if (linhas.length === 0) {
        throw new Error('Nenhuma linha válida encontrada na planilha. Verifique se as colunas têm os nomes corretos (Funcionário/Nome, Data, Valor/Consumo)');
      }

      console.log('Enviando para processamento:', linhas);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/processar-consumo-excel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            linhas: linhas,
            arquivo_nome: arquivo.name,
          }),
        }
      );

      console.log('Resposta da API:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erro da API:', errorText);
        throw new Error(`Erro ao processar arquivo: ${errorText}`);
      }

      const resultadoProcessamento = await response.json();
      console.log('Resultado:', resultadoProcessamento);
      setResultado(resultadoProcessamento);

      // Se houver itens não encontrados, iniciar etapa de mapeamento
      if (resultadoProcessamento.nao_encontrados && resultadoProcessamento.nao_encontrados.length > 0) {
        setEtapaMapeamento(true);
        await carregarColaboradores();
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao processar arquivo: ' + (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const formatarData = (data: any): string => {
    if (!data) return new Date().toISOString().split('T')[0];

    // Data numérica do Excel
    if (typeof data === 'number') {
      const date = XLSX.SSF.parse_date_code(data);
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }

    // Data é objeto Date
    if (data instanceof Date) {
      const year = data.getFullYear();
      const month = String(data.getMonth() + 1).padStart(2, '0');
      const day = String(data.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Data é string
    if (typeof data === 'string') {
      // Remove espaços extras e tenta limpar
      const cleaned = data.trim();

      // Formato DD/MM/YYYY
      const matchDDMMYYYY = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (matchDDMMYYYY) {
        const [_, dia, mes, ano] = matchDDMMYYYY;
        return `${ano}-${mes}-${dia}`;
      }

      // Formato YYYY-MM-DD (com ou sem timestamp)
      const matchYYYYMMDD = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (matchYYYYMMDD) {
        const [_, ano, mes, dia] = matchYYYYMMDD;
        return `${ano}-${mes}-${dia}`;
      }

      // Formato YYYY/MM/DD
      const matchYYYYSlash = cleaned.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
      if (matchYYYYSlash) {
        const [_, ano, mes, dia] = matchYYYYSlash;
        return `${ano}-${mes}-${dia}`;
      }

      // Formato DD-MM-YYYY
      const matchDDHyphen = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})/);
      if (matchDDHyphen) {
        const [_, dia, mes, ano] = matchDDHyphen;
        return `${ano}-${mes}-${dia}`;
      }

      // Tentar parsear com Date
      try {
        const parsed = new Date(cleaned);
        if (!isNaN(parsed.getTime())) {
          const year = parsed.getFullYear();
          const month = String(parsed.getMonth() + 1).padStart(2, '0');
          const day = String(parsed.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch (e) {
        console.warn('Erro ao parsear data:', data, e);
      }
    }

    console.warn('Data não reconhecida, usando data atual:', data);
    return new Date().toISOString().split('T')[0];
  };

  const carregarColaboradores = async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );

      const { data, error } = await supabase
        .from('colaboradores')
        .select('id, nome_completo, funcao_personalizada, tipo_vinculo')
        .eq('status', 'ativo')
        .order('nome_completo');

      if (error) {
        console.error('Erro ao carregar colaboradores:', error);
        alert('Erro ao carregar lista de colaboradores: ' + error.message);
        throw error;
      }

      console.log('Colaboradores carregados:', data?.length || 0);

      if (!data || data.length === 0) {
        alert('Nenhum colaborador ativo encontrado no sistema!');
        return;
      }

      setColaboradores(
        data.map((c: any) => ({
          id: c.id,
          nome: c.nome_completo,
          funcao: c.funcao_personalizada || 'Não informado',
          tipo: c.tipo_vinculo || 'indefinido',
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const handleMapeamento = (nomeOriginal: string, colaboradorId: string) => {
    setMapeamentos(prev => ({
      ...prev,
      [nomeOriginal]: colaboradorId,
    }));
  };

  const confirmarMapeamentos = async () => {
    if (!arquivo) return;

    try {
      setProcessando(true);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/processar-consumo-excel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            linhas: resultado?.nao_encontrados || [],
            arquivo_nome: arquivo.name,
            mapeamentos_manuais: mapeamentos,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao processar mapeamentos');
      }

      const resultadoMapeamento = await response.json();

      // Atualizar resultado combinando os dados
      setResultado(prev => ({
        ...prev!,
        processadas: prev!.processadas + resultadoMapeamento.processadas,
        erros: prev!.erros + resultadoMapeamento.erros,
        detalhes: [...prev!.detalhes, ...resultadoMapeamento.detalhes],
        erros_lista: [...prev!.erros_lista, ...resultadoMapeamento.erros_lista],
        nao_encontrados: [],
      }));

      setEtapaMapeamento(false);
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao processar mapeamentos: ' + (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const pularNaoEncontrados = () => {
    setResultado(prev => ({
      ...prev!,
      nao_encontrados: [],
    }));
    setEtapaMapeamento(false);
  };

  const getColaboradoresFiltrados = (itemNome: string) => {
    const busca = buscaNome[itemNome] || '';
    if (!busca) return colaboradores;
    return colaboradores.filter(c =>
      c.nome.toLowerCase().includes(busca.toLowerCase())
    );
  };

  const exportarResultado = () => {
    if (!resultado) return;

    const ws = XLSX.utils.json_to_sheet(resultado.detalhes);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Processados');

    if (resultado.erros_lista.length > 0) {
      const wsErros = XLSX.utils.json_to_sheet(resultado.erros_lista);
      XLSX.utils.book_append_sheet(wb, wsErros, 'Erros');
    }

    XLSX.writeFile(wb, `resultado-consumo-${Date.now()}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#12141f] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#12141f] border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white/90 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-sky-400" />
              Processar Consumo via Excel (IA)
            </h2>
            <p className="text-sm text-white/50 mt-1">
              Sistema inteligente com reconhecimento de nomes e aprendizado
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-red-400 transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!resultado && (
            <>
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-300 mb-2">Formato esperado da planilha:</h3>
                  <div className="text-sm text-blue-300 space-y-1">
                    <p>• <strong>Coluna 1:</strong> Funcionário/Nome/Colaborador</p>
                    <p>• <strong>Coluna 2:</strong> Data (DD/MM/YYYY ou formato Excel)</p>
                    <p>• <strong>Coluna 3:</strong> Valor/Consumo/Desconto</p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-sky-500/10 to-blue-500/10 border border-sky-500/20 rounded-lg p-4">
                  <h3 className="font-semibold text-sky-300 mb-3 flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Inteligência Artificial Avançada
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">✓</span>
                      <div>
                        <p className="font-medium text-sky-300">Match Exato</p>
                        <p className="text-sky-400 text-xs">Nome idêntico (normalizado)</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">≈</span>
                      <div>
                        <p className="font-medium text-blue-300">Match Parcial</p>
                        <p className="text-blue-400 text-xs">Nome contém ou é contido</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">◆</span>
                      <div>
                        <p className="font-medium text-indigo-300">Trigrama</p>
                        <p className="text-indigo-400 text-xs">Sequências de 3 caracteres</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">≋</span>
                      <div>
                        <p className="font-medium text-purple-300">Fuzzy Match</p>
                        <p className="text-purple-400 text-xs">Múltiplos algoritmos (60%+)</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-sky-500/20">
                    <p className="text-sm text-sky-300 font-medium">
                      ⚡ Sistema com cache inteligente - aprende e acelera a cada uso!
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                  disabled={processando}
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <FileSpreadsheet className="w-16 h-16 text-white/30 mb-4" />
                  {arquivo ? (
                    <>
                      <p className="text-lg font-semibold text-white/80">{arquivo.name}</p>
                      <p className="text-sm text-white/40 mt-2">Clique para escolher outro arquivo</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold text-white/80">
                        Clique para selecionar o arquivo Excel
                      </p>
                      <p className="text-sm text-white/40 mt-2">Arquivos .xlsx ou .xls</p>
                    </>
                  )}
                </label>
              </div>

              {arquivo && (
                <button
                  onClick={processarArquivo}
                  disabled={processando}
                  className="w-full py-3 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-lg hover:from-sky-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processando ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      Processando com IA...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Processar Arquivo
                    </>
                  )}
                </button>
              )}
            </>
          )}

          {etapaMapeamento && resultado?.nao_encontrados && resultado.nao_encontrados.length > 0 && (
            <div className="space-y-6">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Mapeamento Manual Necessário
                </h3>
                <p className="text-sm text-yellow-300">
                  {resultado.nao_encontrados.length} nome(s) não foram encontrados automaticamente.
                  Faça o mapeamento manual abaixo e o sistema aprenderá para as próximas vezes.
                </p>
                <p className="text-xs text-yellow-400 mt-2">
                  {colaboradores.length > 0
                    ? `${colaboradores.length} colaboradores disponíveis para mapeamento`
                    : 'Carregando lista de colaboradores...'}
                </p>
              </div>

              <div className="space-y-4">
                {resultado.nao_encontrados.map((item: any, i: number) => (
                  <div key={i} className="border-2 border-yellow-300 rounded-lg p-4 bg-yellow-500/10">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-white text-lg">{item.funcionario}</p>
                        <p className="text-sm text-white/50 mt-1">
                          Data: {new Date(item.data).toLocaleDateString('pt-BR')} | Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                        </p>
                      </div>
                      {mapeamentos[item.funcionario] && (
                        <div className="flex items-center gap-2 bg-green-500/15 px-3 py-1 rounded-full">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span className="text-xs font-medium text-green-400">Mapeado</span>
                        </div>
                      )}
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-white/80 mb-2 uppercase">
                        Selecione o colaborador correspondente:
                      </label>
                      <input
                        type="text"
                        value={buscaNome[item.funcionario] || ''}
                        onChange={(e) => setBuscaNome(prev => ({
                          ...prev,
                          [item.funcionario]: e.target.value
                        }))}
                        placeholder="Digite para buscar..."
                        className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/5 text-white"
                      />
                    </div>

                    <div className="max-h-64 overflow-y-auto border-2 border-white/15 rounded-lg bg-[#12141f]">
                      {colaboradores.length === 0 ? (
                        <div className="p-4 text-center text-sm text-white/40">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-500 mx-auto mb-2" />
                          Carregando colaboradores...
                        </div>
                      ) : getColaboradoresFiltrados(item.funcionario).length > 0 ? (
                        <>
                          <div className="sticky top-0 bg-white/5 px-4 py-2 text-xs text-white/50 border-b border-white/10">
                            {getColaboradoresFiltrados(item.funcionario).length} colaborador(es) encontrado(s)
                            {buscaNome[item.funcionario] && ` para "${buscaNome[item.funcionario]}"`}
                          </div>
                          <div className="divide-y divide-white/10">
                            {getColaboradoresFiltrados(item.funcionario).map((colaborador) => (
                              <button
                                key={colaborador.id}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleMapeamento(item.funcionario, colaborador.id);
                                  console.log('Mapeado:', item.funcionario, '->', colaborador.nome);
                                }}
                                className={`w-full text-left px-4 py-3 hover:bg-blue-500/10 transition-colors ${
                                  mapeamentos[item.funcionario] === colaborador.id
                                    ? 'bg-blue-500/15 border-l-4 border-blue-600'
                                    : 'border-l-4 border-transparent'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold text-sm text-white">{colaborador.nome}</p>
                                    <p className="text-xs text-white/50">{colaborador.funcao}</p>
                                  </div>
                                  {mapeamentos[item.funcionario] === colaborador.id && (
                                    <CheckCircle className="w-5 h-5 text-blue-400" />
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-sm text-white/40 mb-2">
                            Nenhum colaborador encontrado
                            {buscaNome[item.funcionario] && (
                              <span className="block text-xs mt-1">
                                para "{buscaNome[item.funcionario]}"
                              </span>
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => setBuscaNome(prev => ({ ...prev, [item.funcionario]: '' }))}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Limpar busca
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={pularNaoEncontrados}
                  className="flex-1 px-4 py-3 border border-white/20 rounded-lg text-white/80 hover:bg-white/5 font-medium"
                >
                  Pular Não Encontrados
                </button>
                <button
                  onClick={confirmarMapeamentos}
                  disabled={processando || Object.keys(mapeamentos).length === 0}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-lg hover:from-blue-700 hover:to-sky-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  {processando ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Confirmar Mapeamentos ({Object.keys(mapeamentos).length})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {resultado && !etapaMapeamento && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-500/10 p-4 rounded-lg">
                  <p className="text-sm text-blue-400 font-medium">Total</p>
                  <p className="text-3xl font-bold text-blue-300">{resultado.total_linhas}</p>
                </div>
                <div className="bg-green-500/10 p-4 rounded-lg">
                  <p className="text-sm text-green-400 font-medium">Processadas</p>
                  <p className="text-3xl font-bold text-green-300">{resultado.processadas}</p>
                </div>
                <div className="bg-red-500/10 p-4 rounded-lg">
                  <p className="text-sm text-red-400 font-medium">Erros</p>
                  <p className="text-3xl font-bold text-red-300">{resultado.erros}</p>
                </div>
              </div>

              {resultado.detalhes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white/90">Registros Processados</h3>
                    <button
                      onClick={exportarResultado}
                      className="text-sm px-3 py-1 bg-white/10 text-white/80 rounded hover:bg-white/15 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Exportar Resultado
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Nome Planilha</th>
                          <th className="text-left p-2">Nome Encontrado</th>
                          <th className="text-center p-2">Similaridade</th>
                          <th className="text-center p-2">Método</th>
                          <th className="text-center p-2">Tipo</th>
                          <th className="text-right p-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.detalhes.map((d, i) => {
                          const getMetodoInfo = (metodo: string) => {
                            switch(metodo) {
                              case 'cache': return { label: 'Cache', color: 'bg-emerald-500/15 text-emerald-300', icon: '⚡' };
                              case 'exato': return { label: 'Exato', color: 'bg-green-900/30 text-green-300', icon: '✓' };
                              case 'substring': return { label: 'Parcial', color: 'bg-blue-900/30 text-blue-300', icon: '≈' };
                              case 'trigram': return { label: 'Trigrama', color: 'bg-indigo-500/15 text-indigo-300', icon: '◆' };
                              case 'fuzzy': return { label: 'Fuzzy', color: 'bg-purple-900/30 text-purple-300', icon: '≋' };
                              default: return { label: metodo, color: 'bg-white/10 text-white/80', icon: '?' };
                            }
                          };

                          const metodoInfo = getMetodoInfo(d.metodo_match || 'fuzzy');

                          return (
                            <tr key={i} className="border-t hover:bg-white/5">
                              <td className="p-2">{d.nome_planilha}</td>
                              <td className="p-2 font-medium">{d.nome_oficial}</td>
                              <td className="p-2 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  d.similaridade === 100 ? 'bg-green-900/30 text-green-300' :
                                  d.similaridade >= 80 ? 'bg-blue-900/30 text-blue-300' :
                                  d.similaridade >= 60 ? 'bg-yellow-900/30 text-yellow-300' :
                                  'bg-orange-500/15 text-orange-400'
                                }`}>
                                  {Math.round(d.similaridade)}%
                                </span>
                              </td>
                              <td className="p-2 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${metodoInfo.color}`} title={metodoInfo.label}>
                                  {metodoInfo.icon} {metodoInfo.label}
                                </span>
                              </td>
                              <td className="p-2 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  d.tipo === 'garcom' ? 'bg-blue-900/30 text-blue-300' : 'bg-white/10 text-white/80'
                                }`}>
                                  {d.tipo === 'garcom' ? 'Garçom' : 'Funcionário'}
                                </span>
                              </td>
                              <td className="p-2 text-right font-mono">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.valor)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {resultado.erros_lista.length > 0 && (
                <div>
                  <h3 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Erros Encontrados
                  </h3>
                  <div className="max-h-40 overflow-y-auto border border-red-500/30 rounded-lg bg-red-500/10">
                    {resultado.erros_lista.map((erro, i) => (
                      <div key={i} className="p-3 border-b last:border-b-0 border-red-500/20">
                        <p className="text-sm text-red-300 font-medium">{erro.erro}</p>
                        <p className="text-xs text-red-400 mt-1">
                          Linha: {JSON.stringify(erro.linha)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!resultado.nao_encontrados || resultado.nao_encontrados.length === 0 ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setResultado(null);
                      setArquivo(null);
                      setMapeamentos({});
                      setBuscaNome({});
                      setEtapaMapeamento(false);
                    }}
                    className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/5"
                  >
                    Processar Outro Arquivo
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
                  >
                    Concluir
                  </button>
                </div>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-300 text-center">
                    Existem {resultado.nao_encontrados.length} nome(s) não encontrados aguardando mapeamento manual.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProcessarConsumoExcel;
