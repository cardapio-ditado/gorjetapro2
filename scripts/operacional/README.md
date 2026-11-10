# Andar Operacional — atualização diária

O 8º andar da "Central de agentes do Ditado" (artifact https://claude.ai/artifact/9reGQma3mboq6maWUcqhXt)
mostra Extras e Músicos: quem trabalhou, o que falta pagar e quem pagar primeiro.
A página lê um único documento do banco do artifact: coleção `op`, documento `foto`.

## Como atualizar (todo dia, 6h30 de Cuiabá)

1. Rodar `snapshot.sql` no Supabase (projeto `nzdiojmrukdxavrdazot`) com a ferramenta
   `execute_sql`. É **somente leitura**: não alterar nada no banco.
2. O resultado é uma linha com a coluna `foto` (JSON). Salvar esse JSON, sem a coluna,
   num arquivo local (ex.: `foto.json`).
3. Gravar no artifact com `ArtifactData` → `set`, `collection: "op"`, `doc_id: "foto"`,
   `file_path: foto.json` (o documento existe: ler antes com `get` para pegar a `version`
   e passar em `if_version`).
4. Não mexer em nenhum outro documento do artifact nem republicar a página.

## Regras de negócio (combinadas com o Kadu em 05/11 e 10/11/2026)

- **A referência da fila de pagar é o controle do Cristiano** (Kadu, 10/11/2026): o saldo de cada
  diária (`extras_freelancers.saldo_restante`) e de cada show (`musicos.saldo_restante`), depois dos
  pagamentos que ele informa nos módulos. Nomes parecidos do mesmo artista (até 2 letras de diferença,
  "Projeto · Artista" vale o artista) ficam juntos, sem mexer no cadastro.
- O financeiro só compara: a seção `comparativo` (Auditoria → "Controle × financeiro") põe lado a lado
  o que está em aberto no controle e no Contas a Pagar, vencido até hoje. Um não sobrescreve o outro.
- A auditoria pelos Pix continua (Pix sem diária, recebeu mais que o lançado, pendente já coberto):
  um Pix só paga diária do mesmo dia ou anterior.
- Prazo: extra registrado na casa 7 dias, extra de fora 2 dias, músico 7 dias.
- Ordem de prioridade (na página): dias sem receber descontado o prazo, quantidade em aberto,
  quem volta a trabalhar logo, diarista antes de banda; desempate pelo menor valor.
- Corte do financeiro: o dia anterior ao primeiro Pix da Stone (`banco_extrato` pendente) que não
  tem baixa no fluxo de caixa (mesmo valor, ±3 dias, nome parecido ou mesmo primeiro nome). Pix pago
  com outro nome (ex.: Pix para o entregador, baixa no fornecedor) só sai daqui quando é marcado
  "já lançado" na Conciliação. Até o corte, controle e financeiro têm que bater; depois dele,
  o Pix que já saiu no banco aparece ao lado da pessoa como "sem baixa, a confirmar" e não abate
  a dívida (pode ser vale/salário de quem é da casa).
- Cada pessoa do módulo de Extras aponta para o fornecedor que recebe o Pix (`extras_pessoas.fornecedor_id`);
  só quem não tem esse vínculo é ligado pelo nome.
- Nada no financeiro é alterado pelo andar. Correções só com o OK do Kadu.
