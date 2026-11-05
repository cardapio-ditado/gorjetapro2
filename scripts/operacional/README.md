# Andar Operacional — atualização diária

O 8º andar da "Central de agentes do Ditado" (artifact https://claude.ai/artifact/9reGQma3mboq6maWUcqhXt)
mostra Extras e Músicos: quem trabalhou, quem recebeu Pix e quem pagar primeiro.
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

## Regras de negócio (combinadas com o Kadu em 05/11/2026)

- Dívida real = diária/show lançado − Pix recebido pela pessoa (saídas no `fluxo_caixa`
  nas categorias de extras e de cachê). Um Pix só paga diária do mesmo dia ou anterior;
  para músico vale até 7 dias antes do show (sinal).
- Prazo: extra registrado na casa 7 dias, extra de fora 2 dias, músico 7 dias.
- Ordem de prioridade (na página): dias sem receber descontado o prazo, quantidade em aberto,
  quem volta a trabalhar logo, diarista antes de banda; desempate pelo menor valor.
- Corte do financeiro: o dia anterior ao primeiro Pix da Stone (`banco_extrato` pendente) que não
  tem baixa no fluxo de caixa. Até o corte, controle e financeiro têm que bater; depois dele,
  o Pix que já saiu no banco aparece ao lado da pessoa como "sem baixa, a confirmar" e não abate
  a dívida (pode ser vale/salário de quem é da casa).
- Cada pessoa do módulo de Extras aponta para o fornecedor que recebe o Pix (`extras_pessoas.fornecedor_id`);
  só quem não tem esse vínculo é ligado pelo nome.
- Nada no financeiro é alterado pelo andar. Correções só com o OK do Kadu.
