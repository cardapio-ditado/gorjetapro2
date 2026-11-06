import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, FileText, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import CampoAssinatura from '../components/eventos/assinatura/CampoAssinatura';
import { chamarAssinatura } from '../components/eventos/assinatura/api';

/**
 * Página pública /assinar/<token>: o cliente lê o contrato que o bar já
 * assinou, confirma nome e CPF/CNPJ, aceita e assina. Tudo passa pela edge
 * function contrato-assinatura; a página não lê tabela nenhuma.
 */

interface Dados {
  documento_id: string; titulo: string; evento: string | null; data_evento: string | null;
  contratante: string; representante: string | null;
  documento_mascarado: string; tipo_documento: 'CPF' | 'CNPJ';
  bar_nome: string; bar_em: string; expira_em: string; pdf_url: string | null;
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Cuiaba', dateStyle: 'short', timeStyle: 'short' });
const dataEvento = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

const AssinarContrato: React.FC = () => {
  const { token = '' } = useParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [aceite, setAceite] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ pdf_url: string | null } | null>(null);

  const ver = useCallback(() => chamarAssinatura<Dados>({ acao: 'ver', token }), [token]);

  useEffect(() => {
    ver().then(d => { setDados(d); setNome(d.tipo_documento === 'CPF' ? d.contratante : d.representante || ''); })
      .catch(e => setErro(e instanceof Error ? e.message : 'Não consegui abrir o contrato.'));
  }, [ver]);

  // a URL do PDF vale 5 minutos: pede uma nova a cada clique
  const abrirPdf = async () => {
    const janela = window.open('', '_blank');
    try {
      const d = await ver();
      if (janela && d.pdf_url) janela.location.href = d.pdf_url; else if (d.pdf_url) window.location.href = d.pdf_url;
    } catch (e) {
      janela?.close();
      setErroEnvio(e instanceof Error ? e.message : 'Não consegui abrir o PDF.');
    }
  };

  const digitos = documento.replace(/\D/g, '');
  const nomeOk = nome.trim().split(/\s+/).length >= 2 && nome.trim().length >= 5;
  const docOk = digitos.length === (dados?.tipo_documento === 'CNPJ' ? 14 : 11);
  const podeAssinar = !!dados && nomeOk && docOk && aceite && !!assinatura && !enviando;

  const assinar = async () => {
    if (!podeAssinar) return;
    setEnviando(true); setErroEnvio(null);
    try {
      const r = await chamarAssinatura<{ pdf_url: string | null }>({ acao: 'assinar', token, nome: nome.trim(), documento: digitos, aceite: true, assinatura });
      setPronto(r);
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : 'Não consegui assinar. Tente de novo.');
    } finally { setEnviando(false); }
  };

  const cartao = 'bg-white rounded-2xl border border-[#e4ddd1] p-5 sm:p-6';
  const input = 'w-full rounded-xl border border-[#d6cdbf] bg-white px-3 py-2.5 text-base text-[#1d1b18] focus:outline-none focus:border-[#7a1f2b] focus:ring-2 focus:ring-[#7a1f2b]/15';

  return (
    <div className="min-h-screen bg-[#f6f2ea] text-[#1d1b18] font-sans">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
        <header className="text-center space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-[#7a1f2b] font-semibold">Ditado Popular</p>
          <h1 className="text-2xl font-semibold">Assinatura do contrato</h1>
        </header>

        {!dados && !erro && <div className={`${cartao} flex items-center gap-2 text-[#6b645a]`}><Loader2 className="w-4 h-4 animate-spin" /> Abrindo o contrato…</div>}

        {erro && (
          <div className={`${cartao} text-center space-y-2`}>
            <XCircle className="w-10 h-10 mx-auto text-[#a33a2f]" />
            <p className="font-medium">{erro}</p>
          </div>
        )}

        {pronto && (
          <div className={`${cartao} text-center space-y-3`}>
            <CheckCircle2 className="w-12 h-12 mx-auto text-[#2f7a4a]" />
            <h2 className="text-lg font-semibold">Contrato assinado</h2>
            <p className="text-sm text-[#6b645a]">Obrigado! O PDF assinado tem uma página final com o certificado das duas assinaturas.</p>
            {pronto.pdf_url && (
              <a href={pronto.pdf_url} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#7a1f2b] text-white font-medium hover:bg-[#651924]">
                <Download className="w-4 h-4" /> Baixar PDF assinado
              </a>
            )}
            <p className="text-xs text-[#8a8276]">O botão vale por 10 minutos. Depois, peça uma cópia ao Ditado Popular.</p>
          </div>
        )}

        {dados && !pronto && (
          <>
            <section className={`${cartao} space-y-3`}>
              <div>
                <h2 className="text-lg font-semibold">{dados.evento ?? 'Contrato de evento'}</h2>
                {dados.data_evento && <p className="text-sm text-[#6b645a]">Evento em {dataEvento(dados.data_evento)} · contratante: {dados.contratante}</p>}
              </div>
              <p className="text-sm flex items-start gap-2 text-[#2f7a4a]"><ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> O Ditado Popular já assinou ({dados.bar_nome}, {dataHora(dados.bar_em)}).</p>
              <button type="button" onClick={() => void abrirPdf()} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-[#7a1f2b] text-[#7a1f2b] font-medium hover:bg-[#7a1f2b]/5">
                <FileText className="w-5 h-5" /> Ler o contrato (PDF)
              </button>
              {dados.pdf_url && <iframe src={dados.pdf_url} title="Contrato" className="hidden md:block w-full h-[520px] rounded-xl border border-[#e4ddd1]" />}
              <p className="text-xs text-[#8a8276]">Este link vale até {dataHora(dados.expira_em)} e só serve para uma assinatura.</p>
            </section>

            <section className={`${cartao} space-y-4`}>
              <h2 className="font-semibold">Seus dados</h2>
              <label className="block space-y-1">
                <span className="text-sm text-[#6b645a]">Nome completo{dados.tipo_documento === 'CNPJ' ? ' (de quem assina pela empresa)' : ''}</span>
                <input className={input} value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-[#6b645a]">{dados.tipo_documento} do contrato ({dados.documento_mascarado})</span>
                <input className={input} value={documento} onChange={e => setDocumento(e.target.value)} inputMode="numeric" placeholder="só números" />
              </label>
              {digitos.length > 0 && !docOk && <p className="text-xs text-[#a33a2f]">Digite o {dados.tipo_documento} completo, igual ao do contrato.</p>}
            </section>

            <section className={`${cartao} space-y-4`}>
              <h2 className="font-semibold">Sua assinatura</h2>
              <CampoAssinatura nome={nome} onChange={setAssinatura} />
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#7a1f2b]" />
                <span>Li o contrato e aceito os seus termos. Concordo em assiná-lo eletronicamente nesta plataforma.</span>
              </label>
              {erroEnvio && <p className="text-sm text-[#a33a2f]">{erroEnvio}</p>}
              <button type="button" onClick={() => void assinar()} disabled={!podeAssinar}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-[#7a1f2b] text-white font-semibold hover:bg-[#651924] disabled:opacity-40 disabled:cursor-not-allowed">
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Assinar contrato
              </button>
              <p className="text-xs text-[#8a8276]">Assinatura eletrônica simples (MP 2.200-2/2001, art. 10, § 2º). Registramos nome, data e hora, IP e navegador. Documento nº {dados.documento_id}.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AssinarContrato;
