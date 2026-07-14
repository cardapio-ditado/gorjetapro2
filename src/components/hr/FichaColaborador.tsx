import React, { useRef, useState, useEffect } from 'react';
import {
  X, User, Calendar, Briefcase, DollarSign, Phone, Mail, MapPin,
  FileText, Download, Printer, TrendingUp, AlertTriangle, ShieldAlert
} from 'lucide-react';
import dayjs from 'dayjs';
import { supabase } from '../../lib/supabase';

interface FichaColaboradorProps {
  colaborador: any;
  onClose: () => void;
}

const TIPO_CARREIRA_LABEL: Record<string, string> = {
  admissao: 'Admissão',
  promocao: 'Promoção',
  transferencia: 'Transferência',
  aumento_salarial: 'Aumento Salarial',
  mudanca_vinculo: 'Mudança de Vínculo',
  advertencia: 'Advertência',
  suspensao: 'Suspensão',
  elogio: 'Elogio',
  reconhecimento: 'Reconhecimento',
  treinamento: 'Treinamento',
  ferias: 'Férias',
  afastamento: 'Afastamento',
  demissao: 'Demissão',
  outros: 'Outros',
};

const TIPO_CARREIRA_COLOR: Record<string, string> = {
  admissao: 'text-green-700',
  promocao: 'text-blue-700',
  transferencia: 'text-blue-600',
  aumento_salarial: 'text-green-600',
  mudanca_vinculo: 'text-amber-600',
  advertencia: 'text-orange-600',
  suspensao: 'text-red-600',
  elogio: 'text-green-600',
  reconhecimento: 'text-blue-600',
  treinamento: 'text-cyan-600',
  ferias: 'text-teal-600',
  afastamento: 'text-yellow-700',
  demissao: 'text-red-700',
  outros: 'text-gray-500',
};

const STATUS_FERIAS_LABEL: Record<string, string> = {
  previsto: 'Previsto',
  solicitado: 'Solicitado',
  aprovado: 'Aprovado',
  gozado: 'Gozado',
  cancelado: 'Cancelado',
};

const TIPO_DISCIPLINAR_LABEL: Record<string, string> = {
  advertencia_verbal: 'Advertência Verbal',
  advertencia_escrita: 'Advertência Escrita',
  suspensao: 'Suspensão',
  justa_causa: 'Justa Causa',
  elogio: 'Elogio',
  reconhecimento: 'Reconhecimento',
  premio: 'Prêmio',
};

const TIPO_DISCIPLINAR_COLOR: Record<string, string> = {
  advertencia_verbal: 'bg-yellow-100 text-yellow-800',
  advertencia_escrita: 'bg-orange-100 text-orange-800',
  suspensao: 'bg-red-100 text-red-800',
  justa_causa: 'bg-red-200 text-red-900',
  elogio: 'bg-emerald-100 text-emerald-800',
  reconhecimento: 'bg-blue-100 text-blue-800',
  premio: 'bg-amber-100 text-amber-800',
};

const FichaColaborador: React.FC<FichaColaboradorProps> = ({ colaborador, onClose }) => {
  const fichaRef = useRef<HTMLDivElement>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [ferias, setFerias] = useState<any[]>([]);
  const [ocorrencias, setOcorrencias] = useState<any[]>([]);
  const [disciplinar, setDisciplinar] = useState<any[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    const fetchExtra = async () => {
      setLoadingExtra(true);
      try {
        const [resHist, resFerias, resOcorr, resDisc] = await Promise.all([
          supabase
            .from('rh_historico_carreira')
            .select('*')
            .eq('colaborador_id', colaborador.id)
            .order('data_evento', { ascending: false }),
          supabase
            .from('ferias_colaboradores')
            .select('*, periodos_aquisitivos_ferias(periodo_aquisitivo_inicio, periodo_aquisitivo_fim)')
            .eq('colaborador_id', colaborador.id)
            .order('data_inicio', { ascending: false }),
          supabase
            .from('ocorrencias_colaborador')
            .select('*')
            .eq('colaborador_id', colaborador.id)
            .in('tipo_ocorrencia', ['falta', 'atestado'])
            .order('data_ocorrencia', { ascending: false }),
          supabase
            .from('rh_disciplinar')
            .select('*')
            .eq('colaborador_id', colaborador.id)
            .order('data_ocorrencia', { ascending: false }),
        ]);
        setHistorico(resHist.data || []);
        setFerias(resFerias.data || []);
        setOcorrencias(resOcorr.data || []);
        setDisciplinar(resDisc.data || []);
      } catch (err) {
        console.error('Erro ao buscar dados extras:', err);
      } finally {
        setLoadingExtra(false);
      }
    };
    fetchExtra();
  }, [colaborador.id]);

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!fichaRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const canvas = await html2canvas(fichaRef.current, { scale: 2, logging: false, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Ficha_${colaborador.nome_completo}.pdf`);
    } catch (error) {
      alert('Erro ao gerar PDF da ficha');
    }
  };

  const calcularTempoEmpresa = () => {
    if (!colaborador.data_admissao) return 'N/A';
    const admissao = dayjs(colaborador.data_admissao);
    const hoje = dayjs();
    const anos = hoje.diff(admissao, 'year');
    const meses = hoje.diff(admissao.add(anos, 'year'), 'month');
    if (anos === 0) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
    if (meses === 0) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
    return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  };

  // Section wrapper for print
  const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
        <Icon className="w-5 h-5 text-gray-600" />
        {title}
      </h3>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:bg-white print:relative print:inset-auto">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none">

        {/* Header – hidden on print */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between print:hidden rounded-t-xl">
          <h2 className="text-xl font-bold text-gray-800">Ficha do Colaborador</h2>
          <div className="flex gap-2">
            <button onClick={handleDownload} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Baixar PDF">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={handlePrint} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Imprimir">
              <Printer className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Content */}
        <div ref={fichaRef} className="p-8 bg-white text-gray-800">

          {/* Header */}
          <div className="text-center mb-8 border-b-2 border-gray-300 pb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">FICHA DE COLABORADOR</h1>
            <p className="text-gray-500 text-sm">Dados Cadastrais, Profissionais e Histórico</p>
            <p className="text-gray-400 text-xs mt-1">Gerado em {dayjs().format('DD/MM/YYYY HH:mm')}</p>
          </div>

          {/* Foto e Dados Principais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="flex flex-col items-center">
              <div className="w-36 h-44 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-gray-300 mb-2">
                {colaborador.foto_url ? (
                  <img src={colaborador.foto_url} alt={colaborador.nome_completo} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-16 h-16 text-gray-300" />
                )}
              </div>
              <p className="text-xs text-gray-400">3×4</p>
            </div>

            <div className="md:col-span-2 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Nome Completo</label>
                <p className="text-xl font-bold text-gray-900">{colaborador.nome_completo}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">CPF</label>
                  <p className="text-gray-800">{colaborador.cpf || '—'}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">RG</label>
                  <p className="text-gray-800">{colaborador.rg || '—'}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Data de Nascimento</label>
                <p className="text-gray-800">{colaborador.data_nascimento ? dayjs(colaborador.data_nascimento).format('DD/MM/YYYY') : '—'}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Status</label>
                <span className={`inline-flex px-3 py-0.5 rounded-full text-xs font-bold ${
                  colaborador.status === 'ativo' ? 'bg-green-100 text-green-700' :
                  colaborador.status === 'afastado' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {colaborador.status?.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Dados Profissionais */}
          <Section title="Dados Profissionais" icon={Briefcase}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Função / Cargo</label>
                <p className="text-gray-800 font-medium">{colaborador.funcao_nome || colaborador.funcao_personalizada || '—'}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Tipo de Vínculo</label>
                <p className="text-gray-800">
                  {colaborador.tipo_vinculo === 'clt' ? 'CLT' :
                   colaborador.tipo_vinculo === 'freelancer' ? 'Freelancer' :
                   colaborador.tipo_vinculo === 'prestador' ? 'Prestador' : '—'}
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Data de Admissão</label>
                <p className="text-gray-800">{colaborador.data_admissao ? dayjs(colaborador.data_admissao).format('DD/MM/YYYY') : '—'}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Tempo de Empresa</label>
                <p className="text-gray-800 font-medium">{calcularTempoEmpresa()}</p>
              </div>
              {colaborador.data_demissao && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Data de Demissão</label>
                  <p className="text-gray-800">{dayjs(colaborador.data_demissao).format('DD/MM/YYYY')}</p>
                </div>
              )}
            </div>
          </Section>

          {/* Dados Financeiros */}
          <Section title="Dados Financeiros" icon={DollarSign}>
            <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Salário Fixo</label>
                <p className="text-gray-900 text-lg font-bold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(colaborador.salario_fixo || 0)}
                </p>
              </div>
              {colaborador.valor_diaria > 0 && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Valor Diária</label>
                  <p className="text-gray-800 font-medium">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(colaborador.valor_diaria)}
                  </p>
                </div>
              )}
              {colaborador.percentual_comissao > 0 && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Comissão</label>
                  <p className="text-gray-800 font-medium">{colaborador.percentual_comissao}%</p>
                </div>
              )}
            </div>
          </Section>

          {/* Contato */}
          <Section title="Dados de Contato" icon={Phone}>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Telefone</label>
                  <p className="text-gray-800">{colaborador.telefone || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">E-mail</label>
                  <p className="text-gray-800">{colaborador.email || '—'}</p>
                </div>
              </div>
              <div className="col-span-2 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Endereço</label>
                  <p className="text-gray-800">{colaborador.endereco || '—'}</p>
                </div>
              </div>
            </div>
          </Section>

          {/* Férias */}
          <Section title="Histórico de Férias" icon={Calendar}>
            {loadingExtra ? (
              <p className="text-gray-400 text-sm">Carregando...</p>
            ) : ferias.length === 0 ? (
              <p className="text-gray-400 text-sm italic">Nenhuma férias registrada.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Período Aquisitivo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Início Gozo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Fim Gozo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Dias</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Retorno</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ferias.map((f, i) => {
                    const p = f.periodos_aquisitivos_ferias;
                    return (
                      <tr key={f.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs">
                          {p
                            ? `${dayjs(p.periodo_aquisitivo_inicio).format('MM/YYYY')} – ${dayjs(p.periodo_aquisitivo_fim).format('MM/YYYY')}`
                            : <span className="text-gray-400 italic">Não vinculado</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{dayjs(f.data_inicio).format('DD/MM/YYYY')}</td>
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{dayjs(f.data_fim).format('DD/MM/YYYY')}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{f.dias_corridos}d</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{f.data_prevista_retorno ? dayjs(f.data_prevista_retorno).format('DD/MM/YYYY') : '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            f.status === 'gozado' ? 'bg-green-100 text-green-700' :
                            f.status === 'aprovado' ? 'bg-blue-100 text-blue-700' :
                            f.status === 'solicitado' ? 'bg-yellow-100 text-yellow-700' :
                            f.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{STATUS_FERIAS_LABEL[f.status] || f.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>

          {/* Ocorrências — Faltas e Atestados */}
          <Section title="Ocorrências de Falta e Atestado" icon={AlertTriangle}>
            {loadingExtra ? (
              <p className="text-gray-400 text-sm">Carregando...</p>
            ) : ocorrencias.length === 0 ? (
              <p className="text-gray-400 text-sm italic">Nenhuma falta ou atestado registrado.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Data</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Descrição</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Dias</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ocorrencias.map((o, i) => (
                    <tr key={o.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{dayjs(o.data_ocorrencia).format('DD/MM/YYYY')}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${o.tipo_ocorrencia === 'falta' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {o.tipo_ocorrencia === 'falta' ? 'Falta' : 'Atestado'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{o.descricao || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{o.dias_afastamento > 0 ? `${o.dias_afastamento}d` : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          o.status === 'aprovado' ? 'bg-green-100 text-green-700' :
                          o.status === 'pendente' ? 'bg-yellow-100 text-yellow-700' :
                          o.status === 'rejeitado' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Ocorrências Disciplinares */}
          <Section title="Ocorrências Disciplinares" icon={ShieldAlert}>
            {loadingExtra ? (
              <p className="text-gray-400 text-sm">Carregando...</p>
            ) : disciplinar.length === 0 ? (
              <p className="text-gray-400 text-sm italic">Nenhuma ocorrência disciplinar registrada.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Data</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Motivo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {disciplinar.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{dayjs(d.data_ocorrencia).format('DD/MM/YYYY')}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_DISCIPLINAR_COLOR[d.tipo] ?? 'bg-gray-100 text-gray-700'}`}>
                          {TIPO_DISCIPLINAR_LABEL[d.tipo] ?? d.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{d.motivo || d.descricao || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{d.registrado_por || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Histórico de Carreira */}
          <Section title="Histórico de Carreira" icon={TrendingUp}>
            {loadingExtra ? (
              <p className="text-gray-400 text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-gray-400 text-sm italic">Nenhum evento de carreira registrado.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Data</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Título / Descrição</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Salário</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h, i) => (
                    <tr key={h.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{dayjs(h.data_evento).format('DD/MM/YYYY')}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${TIPO_CARREIRA_COLOR[h.tipo] || 'text-gray-600'}`}>
                          {TIPO_CARREIRA_LABEL[h.tipo] || h.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {h.titulo && <span className="font-medium">{h.titulo}</span>}
                        {h.titulo && h.descricao && <span className="text-gray-400"> — </span>}
                        {h.descricao}
                        {!h.titulo && !h.descricao && '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {h.salario_novo
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(h.salario_novo)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Observações */}
          {colaborador.observacoes && (
            <Section title="Observações" icon={FileText}>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700 whitespace-pre-wrap text-sm">{colaborador.observacoes}</p>
              </div>
            </Section>
          )}

          {/* Rodapé */}
          <div className="mt-10 pt-6 border-t-2 border-gray-300">
            <div className="grid grid-cols-2 gap-8 mt-8">
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 mt-12">
                  <p className="text-xs text-gray-500">Assinatura do Colaborador</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 mt-12">
                  <p className="text-xs text-gray-500">Departamento de RH</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:bg-white, .print\\:bg-white * { visibility: visible; }
          .print\\:bg-white { position: absolute; left: 0; top: 0; width: 100%; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  );
};

export default FichaColaborador;
