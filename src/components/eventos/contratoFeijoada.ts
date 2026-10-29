import { brl, dataPorExtenso, formatarCep, formatarDocumento, hora, inteiroPorExtenso, reaisPorExtenso, soDigitos } from './extenso';

/**
 * O texto do contrato da feijoada (modelo do Kadu, out/2026), montado com os
 * dados do evento. As regras novas são de propósito leves: a casa negocia
 * com o cliente, então o contrato prefere remarcar e conversar a multar.
 */

export interface Contratante {
  nome?: string; documento?: string; representante?: string;
  logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string; cidade?: string; uf?: string;
  telefone?: string; email?: string;
}
export interface Condicoes {
  valor_pessoa?: number; minimo?: number; maximo?: number; prazo_pagamento_dias?: number;
  buffet_inicio?: string; buffet_fim?: string; banda_inicio?: string; banda_fim?: string;
  multa_pct?: number; aviso_rescisao_dias?: number; remarcacao_dias?: number; devolucao_dias?: number;
  taxa_embalagem?: number; clausula_extra?: string;
}

export const CONDICOES_PADRAO: Required<Omit<Condicoes, 'clausula_extra'>> & { clausula_extra: string } = {
  valor_pessoa: 35, minimo: 220, maximo: 300, prazo_pagamento_dias: 7,
  buffet_inicio: '11:00', buffet_fim: '15:00', banda_inicio: '13:00', banda_fim: '15:30',
  multa_pct: 50, aviso_rescisao_dias: 30, remarcacao_dias: 15, devolucao_dias: 2, taxa_embalagem: 15,
  clausula_extra: '',
};

export const CONTRATADA = {
  razao: 'C.E.M. DE OLIVEIRA LTDA', fantasia: 'DITADO PRIME', cnpj: '23.718.514/0001-82',
  endereco: 'Rua Senador Vilas Boas, nº 89, Bairro Popular, CEP 78045-430, Cuiabá – MT',
};

/** Um trecho de texto; b = negrito. */
export type Trecho = { t: string; b?: boolean };
export type Bloco =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'clausula'; texto: string }
  | { tipo: 'paragrafo'; trechos: Trecho[] }
  | { tipo: 'item'; trechos: Trecho[] }
  | { tipo: 'espaco'; mm: number }
  | { tipo: 'assinaturas'; local: string; contratante: string; docContratante: string }
  | { tipo: 'quebra' }
  | { tipo: 'subtitulo'; texto: string };

const p = (...trechos: (string | Trecho)[]): Bloco => ({ tipo: 'paragrafo', trechos: trechos.map(t => (typeof t === 'string' ? { t } : t)) });
const item = (...trechos: (string | Trecho)[]): Bloco => ({ tipo: 'item', trechos: trechos.map(t => (typeof t === 'string' ? { t } : t)) });
const n = (v: number, fem = false) => `${v} (${inteiroPorExtenso(v, fem)})`;
const r$ = (v: number) => `${brl(v)} (${reaisPorExtenso(v)})`;
const lacuna = '______________________';

export function qualificacaoContratante(c: Contratante): Trecho[] {
  const doc = soDigitos(c.documento || '');
  const pj = doc.length === 14;
  const endereco = [
    c.logradouro ? `${c.logradouro}${c.numero ? `, nº ${c.numero}` : ''}${c.complemento ? `, ${c.complemento}` : ''}` : lacuna,
    c.bairro ? `Bairro ${c.bairro}` : null,
    c.cep ? `CEP ${formatarCep(c.cep)}` : null,
    `${c.cidade || 'Cuiabá'} – ${c.uf || 'MT'}`,
  ].filter(Boolean).join(', ');
  const t: Trecho[] = [
    { t: 'CONTRATANTE: ', b: true },
    { t: `${(c.nome || lacuna).trim()}, ` },
    { t: `${pj ? 'pessoa jurídica inscrita no CNPJ' : doc.length === 11 ? 'inscrito(a) no CPF' : 'inscrito(a) no CPF/CNPJ'} sob o nº ${doc ? formatarDocumento(doc) : lacuna}, ` },
    { t: `${pj ? 'com sede na' : 'residente na'} ${endereco}` },
  ];
  if (pj && c.representante?.trim()) t.push({ t: `, neste ato representada por ${c.representante.trim()}` });
  t.push({ t: `, doravante ${pj ? 'denominada' : 'denominado(a)'} simplesmente ` }, { t: 'CONTRATANTE', b: true }, { t: '.' });
  return t;
}

export function montarContratoFeijoada(dados: { dataEvento: string; dataAssinatura: string; contratante: Contratante; condicoes: Condicoes }): Bloco[] {
  const c = { ...CONDICOES_PADRAO, ...Object.fromEntries(Object.entries(dados.condicoes).filter(([, v]) => v !== null && v !== undefined && v !== '')) } as typeof CONDICOES_PADRAO;
  const dataEv = dataPorExtenso(dados.dataEvento);
  const total = c.valor_pessoa * c.minimo;
  const entradasFim = somaHoras(c.buffet_inicio, 2), sobremesaInicio = somaHoras(c.buffet_fim, -2);

  const blocos: Bloco[] = [
    { tipo: 'titulo', texto: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS PARA REALIZAÇÃO DE EVENTO – FEIJOADA' },
    p('Entre as partes abaixo identificadas:'),
    p(...qualificacaoContratante(dados.contratante)),
    p({ t: 'CONTRATADA: ', b: true }, `${CONTRATADA.razao}, nome fantasia ${CONTRATADA.fantasia}, inscrita no CNPJ sob o nº ${CONTRATADA.cnpj}, com sede na ${CONTRATADA.endereco}, doravante denominada simplesmente `, { t: 'CONTRATADA', b: true }, '.'),
    p('As partes têm entre si justo e contratado o seguinte:'),

    { tipo: 'clausula', texto: 'CLÁUSULA 1 – OBJETO DO CONTRATO' },
    p(`O presente contrato tem como objeto a prestação de serviços pela CONTRATADA para a realização de evento gastronômico do tipo FEIJOADA, a ser realizado em ${dataEv}, conforme as condições e especificações estabelecidas neste instrumento.`),

    { tipo: 'clausula', texto: 'CLÁUSULA 2 – DESCRIÇÃO DOS SERVIÇOS' },
    item(`Banda ao vivo no período das ${hora(c.banda_inicio)} às ${hora(c.banda_fim)}.`),
    item(`Serviço de buffet de feijoada completa, incluindo sobremesa, no período das ${hora(c.buffet_inicio)} às ${hora(c.buffet_fim)}, conforme o cardápio do Anexo I.`),
    item(`Disponibilização de espaço climatizado com capacidade para até ${n(c.maximo, true)} pessoas.`),
    item('Fornecimento de equipe completa de atendimento.'),
    item('Isenção de cobrança de couvert artístico para os participantes do evento.'),
    item('Criação da arte e impressão dos convites.'),
    p({ t: 'Parágrafo único. ', b: true }, 'Será cobrada taxa de serviço de 10% (dez por cento) sobre o consumo realizado à parte durante o evento (bebidas e demais itens não incluídos no valor por pessoa), não incidindo sobre o valor da feijoada.'),

    { tipo: 'clausula', texto: 'CLÁUSULA 3 – PREÇO E CONDIÇÕES DE PAGAMENTO' },
    p(`3.1. O valor acordado para a prestação dos serviços descritos neste contrato é de ${r$(c.valor_pessoa)} por pessoa.`),
    p(`3.2. Fica estabelecida a quantidade mínima de ${n(c.minimo)} convites, totalizando o valor mínimo de ${r$(total)}, a ser pago à vista em até ${n(c.prazo_pagamento_dias)} dias antes da realização do evento.`),
    p(`3.3. Os convites vendidos além da quantidade mínima, até o limite de ${n(c.maximo)}, serão pagos pelo mesmo valor por pessoa no acerto final, feito até ${n(c.devolucao_dias)} dias antes do evento, junto com a devolução dos convites não vendidos.`),
    p('3.4. Se o pagamento não ocorrer no prazo, as partes conversarão para combinar uma nova data. Não havendo pagamento até 48 (quarenta e oito) horas antes do evento, a CONTRATADA poderá suspender a sua realização até a regularização, sem multa para qualquer das partes.'),
    p('3.5. Crianças de 0 a 7 anos não pagarão ingresso. Crianças de 8 a 12 anos pagarão meia entrada. Não haverá venda antecipada de ingressos de meia entrada; nestes casos, o pagamento deverá ser realizado diretamente na portaria do evento.'),
    p('3.6. A bilheteria do dia será de responsabilidade da CONTRATADA, incluindo a cobrança por meio de maquininha de cartão e/ou outros meios de pagamento.'),

    { tipo: 'clausula', texto: 'CLÁUSULA 4 – PRAZO DE EXECUÇÃO' },
    p(`A CONTRATADA compromete-se a iniciar a prestação dos serviços no dia ${dataEv}, conforme os horários estabelecidos neste contrato.`),

    { tipo: 'clausula', texto: 'CLÁUSULA 5 – OBRIGAÇÕES DO CONTRATANTE' },
    item(`Realizar a venda mínima de ${n(c.minimo)} e máxima de ${n(c.maximo)} convites.`),
    item(`Devolver os convites não vendidos até ${n(c.devolucao_dias)} dias antes do evento. Convites não devolvidos serão considerados vendidos e deverão ser pagos.`),
    item('A decoração do evento, caso deseje realizá-la, será de responsabilidade do CONTRATANTE, com montagem e retirada em horários combinados com a CONTRATADA.'),
    item(`Não vender convites para retirada da feijoada no local. Caso ocorra, será acrescido o valor de ${r$(c.taxa_embalagem)} por convite, referente à embalagem para retirada (marmita executiva com quatro divisórias).`),
    item('Responder pelos danos materiais comprovadamente causados ao estabelecimento por seus convidados.'),

    { tipo: 'clausula', texto: 'CLÁUSULA 6 – RESPONSABILIDADE DA CONTRATADA' },
    p('A CONTRATADA será responsável pela execução dos serviços descritos neste contrato, garantindo a qualidade dos alimentos, a observância das normas sanitárias, a organização e o cumprimento dos horários estabelecidos.'),

    { tipo: 'clausula', texto: 'CLÁUSULA 7 – REMARCAÇÃO E RESCISÃO' },
    p(`7.1. O evento poderá ser remarcado uma vez, sem custo, mediante aviso com pelo menos ${n(c.remarcacao_dias)} dias de antecedência, para uma data disponível na agenda da CONTRATADA.`),
    p(`7.2. O presente contrato poderá ser rescindido por qualquer das partes mediante comunicação por escrito (inclusive por WhatsApp ou e-mail) com antecedência mínima de ${n(c.aviso_rescisao_dias)} dias, sem multa, com a devolução dos valores eventualmente pagos.`),
    p(`7.3. A rescisão com antecedência inferior à prevista no item 7.2 implicará multa de ${c.multa_pct}% (${inteiroPorExtenso(c.multa_pct)} por cento) do valor mínimo deste contrato.`),
    p('7.4. Em caso fortuito ou de força maior que impeça a realização do evento (como interdição do local, calamidade ou determinação de autoridade pública), as partes remarcarão a data sem multa; não sendo possível, os valores pagos serão devolvidos integralmente.'),

    { tipo: 'clausula', texto: 'CLÁUSULA 8 – USO DE IMAGEM E DADOS' },
    p('O CONTRATANTE autoriza o uso do seu nome e logotipo na arte do convite e na divulgação do evento. Os dados pessoais informados neste contrato serão utilizados apenas para a sua execução, nos termos da Lei nº 13.709/2018 (LGPD).'),
  ];

  let num = 9;
  if (c.clausula_extra?.trim()) {
    blocos.push({ tipo: 'clausula', texto: `CLÁUSULA ${num++} – CONDIÇÕES ESPECIAIS` });
    for (const par of c.clausula_extra.split(/\n+/).map(s => s.trim()).filter(Boolean)) blocos.push(p(par));
  }
  blocos.push(
    { tipo: 'clausula', texto: `CLÁUSULA ${num++} – ASSINATURA ELETRÔNICA` },
    p('As partes reconhecem como válida a assinatura deste contrato por meio eletrônico, inclusive pela plataforma gov.br, nos termos da Lei nº 14.063/2020, dispensada a assinatura de testemunhas.'),
    { tipo: 'clausula', texto: `CLÁUSULA ${num++} – FORO` },
    p('As partes buscarão resolver de forma amigável qualquer divergência sobre este contrato. Persistindo, fica eleito o foro da Comarca de Cuiabá – MT.'),
    p('E, por estarem de acordo, as partes assinam o presente instrumento.'),
    { tipo: 'assinaturas', local: `Cuiabá – MT, ${dataPorExtenso(dados.dataAssinatura)}.`, contratante: (dados.contratante.nome || '').trim(), docContratante: dados.contratante.documento ? formatarDocumento(dados.contratante.documento) : '' },

    { tipo: 'quebra' },
    { tipo: 'titulo', texto: 'ANEXO I – CARDÁPIO DA FEIJOADA' },
    { tipo: 'subtitulo', texto: `Entradas (${hora(c.buffet_inicio)} às ${hora(entradasFim)})` },
    ...['Salgados diversos', 'Pastel de queijo', 'Frios (azeitona, queijo, presunto e ovo de codorna)', 'Torradas', 'Patê de ervas finas', 'Patê de alho'].map(s => item(s)),
    { tipo: 'subtitulo', texto: `Pratos principais (${hora(c.buffet_inicio)} às ${hora(c.buffet_fim)})` },
    ...['Arroz branco', 'Farofa de banana', 'Farofa de calabresa com bacon, ovo e couve', 'Feijoada de rabo', 'Feijoada de carne seca', 'Feijoada de pé', 'Feijoada de costelinha suína', 'Feijoada de orelha', 'Feijoada de calabresa', 'Feijoada de lombo suíno', 'Feijoada completa', 'Batata frita', 'Torresmo', 'Couve refogada', 'Vinagrete', 'Laranja', 'Abacaxi'].map(s => item(s)),
    { tipo: 'subtitulo', texto: `Sobremesa (${hora(sobremesaInicio)} às ${hora(c.buffet_fim)})` },
    item('Pudim'), item('Rapadura'),
  );
  return blocos;
}

function somaHoras(h: string, delta: number) {
  const [hh, mm] = h.split(':').map(Number);
  const t = Math.max(0, Math.min(23 * 60 + 59, hh * 60 + (mm || 0) + delta * 60));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
