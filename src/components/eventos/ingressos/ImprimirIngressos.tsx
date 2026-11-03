import { useEffect, useState } from 'react';
import { Printer, RotateCcw, Ruler, ScanLine, Ban } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Button, Input, Modal, SectionCard } from '../../ui';
import {
  AJUSTE_PADRAO, POR_FOLHA, abrirPdf, carregarAjuste, gerarFolhaTeste, gerarIngressosPdf, salvarAjuste,
  type AjustePapel, type DadosEvento,
} from './ingressosPdf';

/**
 * Impressão dos ingressos de um evento fechado no papel moeda.
 * - Novos: o banco dá os próximos números e um código para o QR.
 * - Reimpressão: mesmos números e códigos (folha que estragou).
 * - Cancelar: ingresso perdido não entra mais na portaria.
 * - Ajuste do papel: folha de teste + deslocamento em mm (vale para todos).
 */

export interface EventoIngresso {
  id: string;
  nome_evento: string;
  data_evento: string;
  horario_inicio?: string | null;
  quantidade_pessoas?: number | null;
}

interface Resumo { emitidos: number; ultimo: number; entradas: number; cancelados: number }

const FRASE_PADRAO = 'Válido somente para este evento e data. Não reembolsável. Apresente na entrada.';
const CHAVE_FRASE = 'ingresso_frase';
const lerFrase = () => { try { return localStorage.getItem(CHAVE_FRASE) ?? FRASE_PADRAO; } catch { return FRASE_PADRAO; } };
const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export default function ImprimirIngressos({ evento, onClose }: { evento: EventoIngresso; onClose: () => void }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [valor, setValor] = useState('');
  const [frase, setFrase] = useState(lerFrase);
  const [posicao, setPosicao] = useState('1');
  const [reDe, setReDe] = useState('');
  const [reAte, setReAte] = useState('');
  const [cancelarNum, setCancelarNum] = useState('');
  const [ajuste, setAjuste] = useState<AjustePapel>(AJUSTE_PADRAO);
  const [verAjuste, setVerAjuste] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'certo' | 'perigo'; texto: string } | null>(null);

  const dadosEvento = (): DadosEvento => ({ nome: evento.nome_evento, data: evento.data_evento, horario: evento.horario_inicio, frase: frase.trim() || undefined });

  const carregarResumo = async () => {
    const { data } = await supabase.from('eventos_ingressos').select('numero, usado_em, cancelado_em').eq('evento_id', evento.id).limit(5000);
    const l = data || [];
    const r: Resumo = {
      emitidos: l.filter(x => !x.cancelado_em).length,
      ultimo: l.reduce((m, x) => Math.max(m, x.numero), 0),
      entradas: l.filter(x => x.usado_em).length,
      cancelados: l.filter(x => x.cancelado_em).length,
    };
    setResumo(r);
    return r;
  };

  useEffect(() => {
    (async () => {
      const [r, a, c] = await Promise.all([
        carregarResumo(),
        carregarAjuste(),
        supabase.from('eventos_contratos').select('convite').eq('evento_id', evento.id).maybeSingle(),
      ]);
      setAjuste(a);
      const falta = Math.max(0, (evento.quantidade_pessoas || 0) - r.emitidos);
      setQuantidade(String(falta || ''));
      const preco = (c.data as any)?.convite?.preco_venda;
      if (preco) setValor(String(preco).replace('.', ','));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento.id]);

  const executar = async (rotulo: string, f: () => Promise<string | void>) => {
    setOcupado(rotulo); setAviso(null);
    try {
      const msg = await f();
      if (msg) setAviso({ tipo: 'certo', texto: msg });
    } catch (e: any) {
      setAviso({ tipo: 'perigo', texto: e.message || 'Não deu certo.' });
    } finally {
      setOcupado(null);
    }
  };

  const nomeArquivo = (sufixo: string) => `ingressos-${evento.nome_evento.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sufixo}.pdf`;

  const imprimirNovos = () => executar('novos', async () => {
    const q = Math.round(num(quantidade));
    if (q < 1) throw new Error('Informe quantos ingressos imprimir.');
    try { localStorage.setItem(CHAVE_FRASE, frase); } catch { /* só conveniência */ }
    const v = valor.trim() ? num(valor) : null;
    const { data, error } = await supabase.rpc('fn_ingressos_emitir', { p_evento_id: evento.id, p_quantidade: q, p_valor: v });
    if (error) throw error;
    const lista = ((data || []) as any[]).sort((a, b) => a.numero - b.numero).map(x => ({ numero: x.numero, codigo: x.codigo, valor: x.valor }));
    const doc = await gerarIngressosPdf(dadosEvento(), lista, ajuste, Math.round(num(posicao)) - 1);
    abrirPdf(doc, nomeArquivo(`${lista[0].numero}-${lista[lista.length - 1].numero}`));
    await carregarResumo();
    setQuantidade('');
    setPosicao('1');
    return `Ingressos nº ${lista[0].numero} a ${lista[lista.length - 1].numero} gerados. Imprima em "Tamanho real" (100%).`;
  });

  const reimprimir = () => executar('reimprimir', async () => {
    const de = Math.round(num(reDe)), ate = Math.round(num(reAte || reDe));
    if (de < 1 || ate < de) throw new Error('Informe do nº e até o nº.');
    const { data, error } = await supabase.from('eventos_ingressos').select('numero, codigo, valor, cancelado_em')
      .eq('evento_id', evento.id).gte('numero', de).lte('numero', ate).order('numero');
    if (error) throw error;
    const lista = (data || []).filter(x => !x.cancelado_em).map(x => ({ numero: x.numero, codigo: x.codigo, valor: x.valor }));
    if (!lista.length) throw new Error('Nenhum ingresso válido nessa faixa.');
    const doc = await gerarIngressosPdf(dadosEvento(), lista, ajuste, Math.round(num(posicao)) - 1);
    abrirPdf(doc, nomeArquivo(`${de}-${ate}`));
    return `Reimpressão do nº ${de} ao ${ate} (${lista.length} ingressos, mesmos QR codes).`;
  });

  const cancelar = () => executar('cancelar', async () => {
    const n = Math.round(num(cancelarNum));
    if (n < 1) throw new Error('Informe o número do ingresso.');
    if (!window.confirm(`Cancelar o ingresso nº ${n}? Ele não vai mais entrar na portaria.`)) return;
    const { data, error } = await supabase.from('eventos_ingressos').update({ cancelado_em: new Date().toISOString() })
      .eq('evento_id', evento.id).eq('numero', n).is('cancelado_em', null).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error(`O ingresso nº ${n} não existe ou já está cancelado.`);
    setCancelarNum('');
    await carregarResumo();
    return `Ingresso nº ${n} cancelado.`;
  });

  const folhaTeste = () => executar('teste', async () => {
    abrirPdf(await gerarFolhaTeste(ajuste), 'folha-teste-ingressos.pdf');
  });

  const guardarAjuste = () => executar('ajuste', async () => {
    await salvarAjuste(ajuste);
    return 'Ajuste do papel salvo. Vale para as próximas impressões.';
  });

  const campoAjuste = (chave: keyof AjustePapel, rotulo: string, dica?: string) => (
    <Input rotulo={rotulo} dica={dica} type="number" step="0.5" inputMode="decimal" value={String(ajuste[chave])}
      onChange={e => setAjuste(a => ({ ...a, [chave]: num(e.target.value) }))} />
  );

  const q = Math.round(num(quantidade));
  const folhas = q > 0 ? Math.ceil((q + Math.max(0, Math.round(num(posicao)) - 1)) / POR_FOLHA) : 0;

  return (
    <Modal aberto onFechar={onClose} titulo="Ingressos" largura="lg"
      descricao={`${evento.nome_evento} · ${evento.data_evento.split('-').reverse().join('/')}${evento.horario_inicio ? ` · ${evento.horario_inicio.slice(0, 5)}` : ''}`}
      rodape={(
        <>
          <Button variante="discreto" icone={<ScanLine size={16} />} onClick={() => window.open('/portaria', '_blank')}>Abrir portaria</Button>
          <Button onClick={onClose}>Fechar</Button>
        </>
      )}>
      <div className="flex flex-col gap-4">
        {resumo && (
          <p className="t-body m-0">
            {resumo.emitidos
              ? <>Já impressos: <strong>{resumo.emitidos}</strong> (nº 1 a {resumo.ultimo}) · entraram <strong>{resumo.entradas}</strong>{resumo.cancelados ? ` · ${resumo.cancelados} cancelado(s)` : ''}</>
              : 'Nenhum ingresso impresso ainda.'}
            {evento.quantidade_pessoas ? <> · evento para {evento.quantidade_pessoas} pessoas</> : null}
          </p>
        )}
        {aviso && <p className={`aviso aviso-${aviso.tipo} m-0`} role="status">{aviso.texto}</p>}

        <SectionCard title="Imprimir novos" descricao={resumo?.ultimo ? `Começam no nº ${resumo.ultimo + 1}.` : 'Começam no nº 1.'}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input rotulo="Quantidade" type="number" min={1} inputMode="numeric" value={quantidade} onChange={e => setQuantidade(e.target.value)}
              dica={folhas ? `${folhas} folha${folhas > 1 ? 's' : ''} de papel moeda` : undefined} />
            <Input rotulo="Valor (opcional)" inputMode="decimal" placeholder="ex.: 35,00" value={valor} onChange={e => setValor(e.target.value)} />
            <Input rotulo="Começar na posição" type="number" min={1} max={POR_FOLHA} inputMode="numeric" value={posicao}
              onChange={e => setPosicao(e.target.value)} dica="1 a 12, para folha já usada" />
          </div>
          <Input className="mt-3" rotulo="Frase no ingresso" value={frase} maxLength={110} onChange={e => setFrase(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <Button variante="primario" icone={<Printer size={16} />} carregando={ocupado === 'novos'} disabled={!!ocupado} onClick={imprimirNovos}>
              Gerar e imprimir
            </Button>
            <span className="t-caption">Na impressão: <strong>Tamanho real (100%)</strong>, bandeja manual, canhoto à esquerda.</span>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard title="Reimprimir" descricao="Mesmos números e QR codes (folha que estragou).">
            <div className="grid grid-cols-2 gap-3">
              <Input rotulo="Do nº" type="number" min={1} value={reDe} onChange={e => setReDe(e.target.value)} />
              <Input rotulo="Até o nº" type="number" min={1} value={reAte} onChange={e => setReAte(e.target.value)} />
            </div>
            <Button className="mt-3" icone={<RotateCcw size={16} />} carregando={ocupado === 'reimprimir'} disabled={!!ocupado} onClick={reimprimir}>Reimprimir</Button>
          </SectionCard>
          <SectionCard title="Cancelar ingresso" descricao="Perdido ou rasgado: não entra mais na portaria.">
            <Input rotulo="Nº do ingresso" type="number" min={1} value={cancelarNum} onChange={e => setCancelarNum(e.target.value)} />
            <Button className="mt-3" variante="perigo" icone={<Ban size={16} />} carregando={ocupado === 'cancelar'} disabled={!!ocupado} onClick={cancelar}>Cancelar</Button>
          </SectionCard>
        </div>

        <SectionCard title="Ajuste do papel" descricao="Faça uma vez: a folha de teste mostra onde cada coisa vai sair."
          action={<Button tamanho="sm" variante="discreto" icone={<Ruler size={14} />} onClick={() => setVerAjuste(v => !v)}>{verAjuste ? 'Esconder' : 'Ajustar'}</Button>}>
          {verAjuste ? (
            <div className="flex flex-col gap-3">
              <ol className="t-caption m-0 pl-4 flex flex-col gap-1" style={{ listStyle: 'decimal' }}>
                <li>Imprima a folha de teste em <strong>papel comum</strong>, em Tamanho real (100%).</li>
                <li>Ponha contra a luz em cima de uma folha de papel moeda, bordas alinhadas.</li>
                <li>Se os retângulos saíram deslocados, mude os números abaixo (em mm), imprima de novo e salve quando bater.</li>
                <li>Antes do evento, teste ler o QR do exemplo com a portaria.</li>
              </ol>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {campoAjuste('dx', 'Para o lado', '+ direita, − esquerda')}
                {campoAjuste('dy', 'Para baixo', '+ desce, − sobe')}
                {campoAjuste('largura', 'Largura', 'de cada ingresso')}
                {campoAjuste('altura', 'Altura', 'de cada ingresso')}
                {campoAjuste('faixa', 'Faixa holográfica', 'mm da borda esquerda')}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icone={<Printer size={16} />} carregando={ocupado === 'teste'} disabled={!!ocupado} onClick={folhaTeste}>Folha de teste</Button>
                <Button variante="primario" carregando={ocupado === 'ajuste'} disabled={!!ocupado} onClick={guardarAjuste}>Salvar ajuste</Button>
                <Button variante="discreto" onClick={() => setAjuste(AJUSTE_PADRAO)}>Voltar ao padrão</Button>
              </div>
            </div>
          ) : (
            <p className="t-caption m-0">
              Atual: {ajuste.dx >= 0 ? '+' : ''}{ajuste.dx} mm para o lado, {ajuste.dy >= 0 ? '+' : ''}{ajuste.dy} mm para baixo, ingresso {ajuste.largura} × {ajuste.altura} mm.
            </p>
          )}
        </SectionCard>
      </div>
    </Modal>
  );
}
