import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { criarPedido, ErroRede } from './api';
import { useVale } from './carrinho';
import { registrar } from './contador';
import { cookiesMeta } from './pixel';
import { Carregando, FaixaTeste, Seletor, Toast } from './comum';
import { cpfValido, dataBR, dataISO, idade, lerOrigem, linkWhats, mascaraCelular, mascaraCPF, mascaraData, reais, soDigitos } from './util';

const CHAVE_DADOS = 'vale_dados_v1';

interface Dados {
  nome: string; cpf: string; nascimento: string; celular: string; email: string;
  presenteNome: string; presenteCpf: string;
}

const VAZIO: Dados = { nome: '', cpf: '', nascimento: '', celular: '', email: '', presenteNome: '', presenteCpf: '' };

function lerDados(): Dados {
  try { return { ...VAZIO, ...JSON.parse(sessionStorage.getItem(CHAVE_DADOS) || '{}') }; } catch { return VAZIO; }
}

/** C1 · checkout (/vale/checkout). Uma página: dados, regras e pagamento. */
export default function Checkout() {
  const { vitrine, itens, produto, definir, totais, presente, setPresente, t, limpar, recarregar } = useVale();
  const navegar = useNavigate();
  const [d, setD] = useState<Dados>(lerDados);
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [aceites, setAceites] = useState({ regulamento: false, maioridade: false, regras: false, whatsapp: false });
  const [forma, setForma] = useState<'pix' | 'cartao'>('pix');
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [mostrarFalta, setMostrarFalta] = useState(false);

  useEffect(() => { document.title = 'Vale Ditado · Pagamento'; window.scrollTo(0, 0); registrar('vale', 'checkout'); }, []);
  useEffect(() => {
    // dados ficam só nesta aba e somem ao fechá-la (para "Gerar novo Pix" sem digitar tudo de novo)
    try { sessionStorage.setItem(CHAVE_DADOS, JSON.stringify({ ...d })); } catch { /* sem armazenamento */ }
  }, [d]);

  const nascISO = dataISO(d.nascimento);
  const menor = nascISO ? idade(nascISO) < 18 : false;

  const erros = useMemo(() => {
    const e: Record<string, string> = {};
    if (!d.nome.trim()) e.nome = 'Falta preencher este campo.';
    else if (!/\S+\s+\S+/.test(d.nome.trim())) e.nome = 'Coloque nome e sobrenome.';
    if (!d.cpf) e.cpf = 'Falta preencher este campo.';
    else if (!cpfValido(d.cpf)) e.cpf = 'Esse CPF não confere. Dá uma olhada nos números.';
    if (!d.nascimento) e.nascimento = 'Falta preencher este campo.';
    else if (!nascISO) e.nascimento = 'Data inválida. Use dd/mm/aaaa.';
    if (!d.celular) e.celular = 'Falta preencher este campo.';
    else if (![10, 11].includes(soDigitos(d.celular).length)) e.celular = 'Confira o celular com DDD.';
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) e.email = 'Esse e-mail parece incompleto.';
    if (presente) {
      if (!/\S+\s+\S+/.test(d.presenteNome.trim())) e.presenteNome = d.presenteNome ? 'Coloque nome e sobrenome.' : 'Falta preencher este campo.';
      if (!cpfValido(d.presenteCpf)) e.presenteCpf = d.presenteCpf ? 'O CPF de quem vai ganhar não confere.' : 'Falta preencher este campo.';
    }
    return e;
  }, [d, nascISO, presente]);

  if (!vitrine) return <Carregando />;

  const linhas = Object.entries(itens).map(([slug, q]) => ({ p: produto(slug), q })).filter((x) => x.p);
  if (linhas.length === 0) return (
    <div className="v-fundo"><div className="v-col" style={{ paddingTop: 48, textAlign: 'center' }}>
      <h1 className="v-h2">Carrinho vazio.</h1>
      <p className="v-apoio">A mesa está posta, falta escolher.</p>
      <Link to="/vale" className="v-cta">Ver os vales</Link>
    </div></div>
  );

  const c = vitrine.campanha;
  const temAlcool = totais.temAlcool;
  const bloqueioIdade = menor && temAlcool;

  // o que falta e onde (o botão mostra o valor desde o começo; ao apertar, leva a pessoa ao que falta)
  const ORDEM: (keyof Dados)[] = ['nome', 'cpf', 'nascimento', 'celular', 'email', 'presenteNome', 'presenteCpf'];
  const falta = ((): [string, string] | null => {
    const campoErro = ORDEM.find((k) => erros[k]);
    if (campoErro) return ['Falta conferir seus dados.', `c-${campoErro}`];
    if (bloqueioIdade) return ['Tire os itens com álcool para continuar.', 'a-idade'];
    if (!aceites.regulamento) return ['Falta aceitar o regulamento.', 'k-regulamento'];
    if (temAlcool && !aceites.maioridade) return ['Falta confirmar que é maior de 18.', 'k-maioridade'];
    if (!aceites.regras) return ['Falta aceitar as regras de uso.', 'k-regras'];
    if (vitrine.situacao !== 'aberta') return ['A venda ainda não abriu.', ''];
    return null;
  })();

  const set = (k: keyof Dados, v: string) => setD((x) => ({ ...x, [k]: v }));
  const mostra = (k: string) => (tocado[k] || tocado._todos) && erros[k];

  const tirarAlcool = () => linhas.forEach(({ p }) => { if (p!.tem_alcool) definir(p!.slug, 0); });

  async function pagar() {
    setTocado((x) => ({ ...x, _todos: true }));
    if (enviando) return;
    if (falta) {
      setMostrarFalta(true);
      const el = falta[1] ? document.getElementById(falta[1]) : null;
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.setTimeout(() => el.focus({ preventScroll: true }), 350); }
      return;
    }
    setEnviando(true);
    setErroGeral(null);
    try {
      const r = await criarPedido({
        nome: d.nome.trim(), cpf: soDigitos(d.cpf), nascimento: nascISO, telefone: soDigitos(d.celular), email: d.email.trim() || null,
        presente, presente_nome: presente ? d.presenteNome.trim() : null, presente_cpf: presente ? soDigitos(d.presenteCpf) : null,
        aceite_regulamento: aceites.regulamento, aceite_regras: aceites.regras, aceite_maioridade: temAlcool ? aceites.maioridade : false,
        aceita_whatsapp: aceites.whatsapp, forma_pagamento: forma, origem: { ...lerOrigem(), ...cookiesMeta() },
        itens: linhas.map(({ p, q }) => ({ slug: p!.slug, quantidade: q })),
      });
      if (r.ok && r.token) {
        registrar('vale', 'pagamento');
        limpar();
        navegar(`/vale/c/${r.token}`);
        return;
      }
      tratarErro(r.erro, r);
    } catch (e) {
      setErroGeral(e instanceof ErroRede ? 'Parece que a internet caiu. Confira e tente de novo.' : 'Deu ruim do nosso lado. Tente de novo em instantes ou chame no WhatsApp (65) 4141-3655.');
    } finally {
      setEnviando(false);
    }
  }

  function tratarErro(erro: string | undefined, r: { slug?: string; produto?: string; restam?: number; limite?: number; ainda_pode?: number }) {
    switch (erro) {
      case 'esgotado':
        if (r.slug) definir(r.slug, 0);
        setErroGeral(`Enquanto você preenchia, o lote de ${r.produto} acabou. Tiramos ele do carrinho. O resto continua garantido.`);
        recarregar();
        break;
      case 'estoque':
        if (r.slug && r.restam != null) definir(r.slug, r.restam);
        setErroGeral(`Só restam ${r.restam} de ${r.produto}. Ajustamos a quantidade.`);
        recarregar();
        break;
      case 'limite_cpf':
        setErroGeral(`Esse CPF já chegou no limite de ${r.limite} ${r.produto}. Cada CPF leva até ${r.limite} de cada produto.${r.ainda_pode ? ` Ainda dá para levar ${r.ainda_pode}.` : ''}`);
        if (r.slug) definir(r.slug, r.ainda_pode ?? 0);
        break;
      case 'menor_alcool':
        setErroGeral('Pela lei, produto com bebida alcoólica só para maiores de 18. Tire do carrinho os itens com álcool para continuar.');
        break;
      case 'cpf': setErroGeral('Esse CPF não confere. Dá uma olhada nos números.'); break;
      case 'presente_cpf': setErroGeral('O CPF de quem vai ganhar não confere.'); break;
      case 'aceites': setErroGeral('Marque as caixas obrigatórias para continuar.'); break;
      case 'venda_antes': case 'venda_fechada': setErroGeral('A venda ainda não abriu. Volta aqui na abertura.'); break;
      case 'venda_encerrada': setErroGeral('A venda do Vale Ditado acabou.'); break;
      case 'pagamento': setErroGeral('Algo falhou ao gerar o pagamento. Nada foi cobrado. Tente de novo.'); break;
      default: setErroGeral('Deu ruim do nosso lado. Tente de novo em instantes ou chame no WhatsApp (65) 4141-3655.');
    }
  }

  const campo = (k: keyof Dados, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, mascara?: (s: string) => string, ajuda?: string) => (
    <div className={`v-campo${mostra(k) ? ' v-erro' : ''}`}>
      <label htmlFor={`c-${k}`}>{label}</label>
      <input id={`c-${k}`} value={d[k]} onChange={(e) => set(k, mascara ? mascara(e.target.value) : e.target.value)}
        onBlur={() => setTocado((x) => ({ ...x, [k]: true }))} aria-invalid={!!mostra(k)} aria-describedby={`a-${k}`} {...props} />
      {mostra(k) ? <span className="v-msg-erro" id={`a-${k}`}>{erros[k]}</span> : ajuda ? <span className="v-ajuda" id={`a-${k}`}>{ajuda}</span> : null}
    </div>
  );

  return (
    <div className="v-fundo v-checkout">
      <FaixaTeste />
      <div className="v-col" style={{ paddingTop: 16 }}>
        <Link to="/vale" className="v-link">← Voltar aos vales</Link>
        <h1 className="v-h1" style={{ marginTop: 8 }}>Quase lá.</h1>
        <p className="v-apoio" style={{ margin: '6px 0 0' }}>Preencha seus dados. O vale sai no seu nome (ou no de quem vai ganhar).</p>
        <div className="v-passos-topo"><b>1 Dados</b> · <span>2 Regras</span> · <span>3 Pagamento</span></div>

        {/* resumo recolhido */}
        <div className="v-card" style={{ marginBottom: 20 }}>
          <button type="button" className="v-faq-q" aria-expanded={resumoAberto} onClick={() => setResumoAberto(!resumoAberto)} style={{ minHeight: 40, padding: 0 }}>
            <span>Seu pedido · {totais.vales} {totais.vales === 1 ? 'vale' : 'vales'} · R$ {reais(totais.total)}</span>
            <span className="v-link" style={{ minHeight: 0 }}>{resumoAberto ? 'fechar' : 'ver'}</span>
          </button>
          {resumoAberto && linhas.map(({ p, q }) => (
            <div className="v-linha" key={p!.slug}>
              <div>
                <div style={{ fontWeight: 700 }}>{q}x {p!.nome}</div>
                <div className="v-legenda v-num">R$ {reais(p!.preco_por * q)}</div>
                <button type="button" className="v-link" style={{ minHeight: 32, fontSize: 13 }} onClick={() => definir(p!.slug, 0)}>Tirar</button>
              </div>
              <Seletor p={p!} claro />
            </div>
          ))}
          <div className="v-total v-num"><span>Total: R$ {reais(totais.total)}</span></div>
          {totais.economia > 0 && <div className="v-legenda v-economia-escura">Você economizou R$ {reais(totais.economia)}</div>}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); pagar(); }} noValidate>
          {campo('nome', 'Nome completo', { placeholder: 'Como está no documento', autoComplete: 'name', autoCapitalize: 'words' })}
          {campo('cpf', 'CPF', { placeholder: '000.000.000-00', inputMode: 'numeric', autoComplete: 'off' }, mascaraCPF, 'Usado para emitir e conferir o vale.')}
          {campo('nascimento', 'Data de nascimento', { placeholder: 'dd/mm/aaaa', inputMode: 'numeric', autoComplete: 'bday' }, mascaraData)}
          {campo('celular', 'Celular (WhatsApp)', { placeholder: '(65) 90000-0000', inputMode: 'tel', autoComplete: 'tel-national' }, mascaraCelular, 'O comprovante fica no link que aparece depois do pagamento.')}
          {campo('email', 'E-mail (opcional)', { placeholder: 'voce@email.com', inputMode: 'email', autoComplete: 'email', type: 'email', spellCheck: false, name: 'email' })}

          {bloqueioIdade && (
            <div className="v-alerta" role="alert" id="a-idade" tabIndex={-1}>
              <p style={{ margin: '0 0 10px' }}>Pela lei, produto com bebida alcoólica só para maiores de 18. Tire do carrinho os itens com álcool para continuar. A Família no Ditado e os Vales Ditado 100 e 200 você pode levar.</p>
              <button type="button" className="v-btn" onClick={tirarAlcool}>Tirar itens com álcool</button>
            </div>
          )}

          <label className="v-interruptor">
            <span>É presente?</span>
            <input type="checkbox" checked={presente} onChange={(e) => setPresente(e.target.checked)} />
          </label>
          {presente && (
            <>
              <p className="v-ajuda" style={{ marginTop: 0 }}>O vale fica no nome da pessoa. Só ela resgata.</p>
              {campo('presenteNome', 'Nome de quem vai ganhar', { placeholder: 'Nome completo', autoCapitalize: 'words' })}
              {campo('presenteCpf', 'CPF de quem vai ganhar', { placeholder: '000.000.000-00', inputMode: 'numeric' }, mascaraCPF)}
            </>
          )}

          <div className="v-passos-topo"><span>1 Dados</span> · <b>2 Regras</b> · <span>3 Pagamento</span></div>
          <div className="v-card">
            <h2 className="v-h3" style={{ marginTop: 0 }}>Antes de pagar, confira:</h2>
            <ul className="v-regras" style={{ margin: 0 }}>
              <li><span>Válido até <b>{dataBR(c.validade_ate)}</b> ({c.validade_meses} meses).</span></li>
              <li><span>Qualquer dia que o bar abrir.</span></li>
              <li><span>Vale numa visita só: o que sobrar naquela noite não fica para outro dia.</span></li>
              <li><span>10% de serviço sobre o valor pago. Couvert à parte.</span></li>
              <li><span>Não junta com outras promoções.</span></li>
              <li><span>7 dias para desistir, com devolução integral.</span></li>
            </ul>
          </div>
          <label className={`v-check${tocado._todos && !aceites.regulamento ? ' v-erro' : ''}`}>
            <input id="k-regulamento" type="checkbox" checked={aceites.regulamento} onChange={(e) => setAceites({ ...aceites, regulamento: e.target.checked })} />
            <span>Li e aceito o <Link to="/vale/regulamento" target="_blank" className="v-link v-inline">regulamento</Link>.</span>
          </label>
          {temAlcool && (
            <label className={`v-check${tocado._todos && !aceites.maioridade ? ' v-erro' : ''}`}>
              <input id="k-maioridade" type="checkbox" checked={aceites.maioridade} onChange={(e) => setAceites({ ...aceites, maioridade: e.target.checked })} />
              <span>Sou maior de 18 anos.</span>
            </label>
          )}
          <label className={`v-check${tocado._todos && !aceites.regras ? ' v-erro' : ''}`}>
            <input id="k-regras" type="checkbox" checked={aceites.regras} onChange={(e) => setAceites({ ...aceites, regras: e.target.checked })} />
            <span>Entendi as regras de uso: validade, uma visita só, 10% e couvert.</span>
          </label>
          {tocado._todos && (!aceites.regulamento || !aceites.regras || (temAlcool && !aceites.maioridade)) && (
            <p className="v-msg-erro">Marque as caixas obrigatórias para continuar.</p>
          )}
          <label className="v-check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={aceites.whatsapp} onChange={(e) => setAceites({ ...aceites, whatsapp: e.target.checked })} />
            <span>Quero receber novidades e ofertas do Ditado pelo WhatsApp. Posso sair quando quiser respondendo SAIR.<br /><span className="v-legenda">Opcional. Não muda nada na sua compra.</span></span>
          </label>

          <div className="v-passos-topo"><span>1 Dados</span> · <span>2 Regras</span> · <b>3 Pagamento</b></div>
          <h2 className="v-h3" style={{ marginTop: 0 }}>Como você quer pagar?</h2>
          <div className="v-opcoes" role="radiogroup" aria-label="Forma de pagamento">
            <button type="button" role="radio" aria-checked={forma === 'pix'} className={`v-opcao${forma === 'pix' ? ' v-sel' : ''}`} onClick={() => setForma('pix')}>
              <span>Pix</span><span className="v-selo v-selo-musgo">aprovação na hora</span>
            </button>
            <button type="button" role="radio" aria-checked={forma === 'cartao'} className={`v-opcao${forma === 'cartao' ? ' v-sel' : ''}`} onClick={() => setForma('cartao')}>
              <span>Cartão de crédito</span>
            </button>
          </div>
          <p className="v-legenda">Separamos seus vales por 30 minutos.
            {t('gateway_nome') ? ` Pagamento processado pelo ${t('gateway_nome')}.` : ''}
            {t('recebedor_nome') ? <> No banco, o recebedor aparece como <b>{t('recebedor_nome')}</b>, a empresa que recebe os pagamentos do Ditado.</> : null}</p>

          {erroGeral && <div className="v-alerta" role="alert">{erroGeral}</div>}

          <div className="v-rodape-fixo">
            {mostrarFalta && falta && <p className="v-falta" role="alert">{falta[0]}</p>}
            <button type="submit" className="v-cta" disabled={enviando}>
              {enviando ? 'Gerando seu pagamento…' : `Pagar R$ ${reais(totais.total)}${forma === 'pix' ? ' com Pix' : ''}`}
            </button>
          </div>
          <p className="v-legenda v-centro"><b>Beba com moderação. Proibido para menores de 18 anos.</b></p>
          <p className="v-legenda v-centro">Dúvida? <a className="v-link" href={linkWhats(t('whatsapp'))} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
          <div style={{ height: 40 }} />
        </form>
      </div>
      <Toast />
    </div>
  );
}
