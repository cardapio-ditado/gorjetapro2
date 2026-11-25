---
name: design-taste-frontend-carregador
description: Carrega a taste-skill (design-taste-frontend, de leonxlnx/taste-skill) para criar, refazer ou melhorar o visual de site, landing page ou página de venda com cara profissional, sem jeito de sistema nem de modelo pronto. Use quando o Kadu pedir site, landing page, página de campanha, "deixar profissional", "parece sistema" ou "parece feito por IA", inclusive na página /vale do Ditado.
---

# Taste-skill (carregador)

A taste-skill original tem cerca de 40 MB (scripts, modelos e verificador). Ela não cabe como skill da conta,
então esta skill pequena baixa a versão fixada no começo da sessão e passa para ela.

## 1. Instalar na sessão (uma vez por sessão)

```bash
if [ ! -f ~/.claude/skills/design-taste-frontend/SKILL.md ]; then
  rm -rf /tmp/taste-skill && git clone -q https://github.com/leonxlnx/taste-skill.git /tmp/taste-skill \
    && git -C /tmp/taste-skill checkout -q d1a2bb41d927083ac7118f60cfc9cdf711810ea0 \
    && mkdir -p ~/.claude/skills && cp -r /tmp/taste-skill/skills/taste-skill ~/.claude/skills/design-taste-frontend
fi
```

A versão está fixada no commit `d1a2bb4` (24/11/2026), a mesma usada na página /vale. Só troque de versão
se o Kadu pedir, e leia o SKILL.md novo antes de usar.

## 2. Usar

Leia `~/.claude/skills/design-taste-frontend/SKILL.md` inteiro e siga, junto com as referências que ele indica.

## 3. Regras da casa (valem sobre a taste-skill)

- **Foto só real.** Nunca foto de banco de imagem nem gerada por IA no lugar da comida ou do bar do Ditado.
  Sem foto, o produto aparece só com texto (ou o bloco com o que vem no kit) até a foto real chegar pelo admin.
- **Cores do Manual da Marca Ditado Brasa & Bar** (as do tema claro do sistema, `src/index.css`): fundo off-white
  `#f5efe6`, cartão `#fffdf9`, botão principal terracota `#b65b43`, acento e faixa verde musgo `#46513a`,
  texto carvão `#1a1a1a`, apoio `#5e554d`, âmbar `#d99736` só em detalhe. O vermelho fica só na logo.
- Títulos em Charis SIL (o Charter livre, `public/fonts/vale/`), texto na fonte do sistema.
- Textos aprovados pelo Kadu não mudam sem pedido. Nada de avaliação, número ou depoimento inventado.
- Não construir antes de mostrar o plano e receber o "pode". Não publicar na `main` sem pedido.
- Para revisar o resultado, use também a skill `web-design-guidelines` (Vercel).
