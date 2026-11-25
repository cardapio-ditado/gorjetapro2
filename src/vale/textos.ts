/**
 * Copy da página /vale (docs/copy-pagina.md, v1 de 24/11/2026). Cada texto pode ser trocado pelo admin
 * (vale_campanha.textos, mesma chave). Os itens [CONFIRMAR] ficam vazios até o admin preencher, e o que
 * está vazio não aparece na página.
 */
export const TEXTOS_PADRAO = {
  // S1 — Black
  black_faixa: 'BLACK BRASA · SÓ ATÉ SEGUNDA (30/11)',
  black_titulo: 'Mais vale um Ditado na mão.',
  black_subtitulo: 'Kits, cartelas de chopp e vales com até {pct}% de desconto. Compra agora, usa em até {meses} meses.',
  black_brinde_linha: 'Comprou até segunda, ganhou bolinho. Quem cedo compra, o bolinho ajuda.',
  black_cta: 'Escolher meu vale',
  black_apoio: 'Só pelo site. No bar não tem esse preço.',
  // S1 — Natal
  natal_faixa: 'VALE DE NATAL · ATÉ 24/12',
  natal_titulo: 'Dá um Ditado de presente.',
  natal_subtitulo: 'Kit com chopp, cartela ou vale em reais, com o nome de quem vai ganhar. Usa em até {meses} meses.',
  natal_cta: 'Escolher o presente',
  natal_apoio: 'Presente que ninguém devolve.',
  // Adendo 2: faixa do Natal ("Por causa do sucesso da Black Brasa..." só se a Black vendeu de verdade)
  natal_faixa_topo: 'Voltou: Vale de Natal do Ditado, até 24/12.',
  linha_confianca: 'Pix na hora · Código com QR na hora · 7 dias para desistir',
  // S3
  destaque_1_titulo: 'Até {pct}% mais barato', destaque_1_texto: 'Preço que só existe aqui no site.',
  destaque_2_titulo: '{meses} meses para usar', destaque_2_texto: 'Qualquer dia que a casa abrir, numa visita.',
  destaque_3_titulo: 'Pra você ou de presente', destaque_3_texto: 'Coloca o nome de quem vai ganhar na compra.',
  ditado_secao: 'Quem guarda, tem.',
  // S4
  grade_titulo: 'Escolha o seu',
  grade_subtitulo: 'Lote limitado. Quando acabar, acabou.',
  bloco_chopp: 'Chopp pra mesa', bloco_kits: 'Kits de mesa', bloco_drinks: 'Drinks', bloco_familia: 'Pra família',
  // S5
  credito_titulo: 'Não sabe o que escolher? Dá crédito.',
  credito_texto: 'Você paga R$ 100 e consome R$ 125. Ou paga R$ 200 e consome R$ 250. Usa no que quiser do cardápio, numa visita, em até {meses} meses.',
  credito_pequeno: 'Vale numa visita só: o que sobrar não fica para outro dia. Não paga garrafas nem itens de outras promoções. Não dá troco: se passar do crédito, paga a diferença na hora.',
  // S6
  como_titulo: 'Simples como pedir mais uma.',
  // S7
  presente_titulo_natal: 'Presente bom é o que vira encontro.',
  presente_titulo_black: 'Dá de presente.',
  presente_texto: 'Na compra, marque "é presente" e coloque o nome e o CPF de quem vai ganhar. O vale sai no nome da pessoa. Você manda o link pelo WhatsApp e ela usa quando quiser, em até {meses} meses.',
  presente_cta: 'Montar meu presente',
  // S9
  faq_nota: 'Sai no bar, quando você usa o vale, em nome da K M Popular Bar Ltda.',
  // S10 e [CONFIRMAR]
  endereco: '',
  email: '',
  horario: '',
  recebedor_nome: '',
  gateway_nome: '',
  hora_abertura: '',
  whatsapp: '556541413655',
};

export type ChaveTexto = keyof typeof TEXTOS_PADRAO;

export function criarTextos(sobrescritos: Record<string, string> | undefined) {
  return (k: ChaveTexto, vars: Record<string, string | number> = {}) => {
    const s = sobrescritos?.[k];
    let v = (typeof s === 'string' && s.trim() !== '' ? s : TEXTOS_PADRAO[k]) as string;
    for (const [nome, valor] of Object.entries(vars)) v = v.split(`{${nome}}`).join(String(valor));
    return v;
  };
}
export type Textos = ReturnType<typeof criarTextos>;
