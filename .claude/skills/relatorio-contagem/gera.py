#!/usr/bin/env python3
"""Relatório "Faltas e sobras da contagem" (Bar e Central), no layout fixo de 23/10.

Uso: python3 gera.py dados.json config.json saida.html
  dados.json  = o JSON da coluna "r" de consulta.sql
  config.json = textos e decisões do dia (ver SKILL.md)
"""
import html, json, sys
from pathlib import Path

AQUI = Path(__file__).parent
dados = json.load(open(sys.argv[1]))
cfg = json.load(open(sys.argv[2]))
NOMES = json.load(open(AQUI / 'nomes.json'))
e = html.escape


def num(v, sinal=False):
    if v is None:
        return '–'
    v = round(v, 3)
    if v == int(v):
        s = f'{int(abs(v)):,}'.replace(',', '.')
    else:
        s = f'{abs(v):.2f}'.replace('.', ',')
    if sinal and v != 0:
        return ('+' if v > 0 else '−') + s
    return ('−' if v < 0 else '') + s


def brl(v):
    return 'R$ ' + f'{abs(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def fracionado(*vs):
    return any(v is not None and round(v, 3) != int(round(v, 3)) for v in vs)


def nome_bonito(item, um, frac):
    n = NOMES.get(item)
    if not n:
        n = ' '.join(item.replace(' GF', '').split()).capitalize()
    if um == 'litro' and '(' not in n:
        n += ' (litros)'
    elif frac and '(' not in n and um == 'unidade':
        n += ' (garrafa)'
    return n


ignorar = cfg.get('ignorar', {})
notas = cfg.get('notas', {})
pares = {a: (b, rot) for a, b, rot in cfg.get('pares', [])}

# ---------- 1. diferença de cada item em cada estoque ----------
# Item contado hoje: dif = contado − deveria (o complemento de contagem soma no contado).
# Item não contado que recebeu acerto com custo depois do fechamento (transferência ou venda
# reconhecida): a dif é o próprio acerto e conta como transferência explícita.
reg = {}
for l in dados['linhas']:
    if l['item'] in ignorar:
        continue
    reg[(l['est'], l['item'])] = dict(est=l['est'], item=l['item'], um=l['um'], cat=l['cat'], custo=l['custo'],
                                      contado_hoje=True, entrou=l['entrou'], vendeu=l['vendeu'],
                                      deveria=l['deveria'], contado=l['contado'], extra=[], explicito=0.0)
sem_custo = []
acertos = [a for a in (dados.get('acertos') or []) if a['item'] not in ignorar]
for a in acertos:
    if a['origem'] == 'correcao' and not a['custo_total']:
        sem_custo.append(a)
for a in acertos:
    if a['origem'] == 'correcao' and not a['custo_total']:
        continue
    k = (a['est'], a['item'])
    if k not in reg:
        antes = round(a['saldo'] - sum(x['qtd'] for x in acertos if (x['est'], x['item']) == k), 3)
        reg[k] = dict(est=a['est'], item=a['item'], um='unidade', cat=a['cat'], custo=a.get('custo_un') or 0,
                      contado_hoje=False, entrou=None, vendeu=None, deveria=antes, contado=antes, extra=[], explicito=0.0)
    r = reg[k]
    r['contado'] = round(r['contado'] + a['qtd'], 3) if (a['origem'] == 'contagem' or not r['contado_hoje']) else r['contado']
    if a['origem'] == 'contagem':
        r['extra'].append('contado depois')
    elif not r['contado_hoje']:
        r['explicito'] = round(r['explicito'] + a['qtd'], 3)
for r in reg.values():
    r['dif'] = round(r['explicito'] if not r['contado_hoje'] and r['explicito'] else r['contado'] - r['deveria'], 3)

# ---------- 2. Central x Bar: o que foi só transferência ----------
# Sobra num estoque e falta no outro = mercadoria que mudou de lugar sem registro.
# Transferência explícita (acerto com custo): quantidade exata. Senão: unidades inteiras.
desceu, subiu = [], []
for item in sorted({i for _, i in reg}):
    b = reg.get(('Bar', item))
    par = pares.get(item)
    c = reg.get(('Central', par[0] if par else item))
    if not b or not c or b['dif'] * c['dif'] >= 0:
        continue
    if b['explicito'] or c['explicito']:
        t = round(min(abs(b['dif']), abs(c['dif'])), 3)
    else:
        t = min(round(abs(b['dif'])), round(abs(c['dif'])))
    if not t:
        continue
    nome = par[1] if par else nome_bonito(item, b['um'], False)
    s = 1 if b['dif'] > 0 else -1
    (desceu if s > 0 else subiu).append((nome, t))
    for r, sg in ((b, s), (c, -s)):
        r['dif'] = round(r['dif'] - sg * t, 3)
        r['deveria'] = round(r['deveria'] + sg * t, 3)
        if r['entrou'] is not None:
            r['entrou'] = round(r['entrou'] + sg * t, 3)

# ---------- 3. faltas, sobras e doses ----------
faltas, sobras, doses_f, doses_s = [], [], [], []
for r in reg.values():
    if abs(r['dif']) < 0.005:
        continue
    r['valor'] = round(r['dif'] * r['custo'], 2)
    frac = fracionado(r['dif'], r['contado'], r['deveria'])
    r['nome'] = nome_bonito(r['item'], r['um'], frac)
    dose = r['um'] == 'unidade' and frac and abs(r['dif']) < 1 and abs(r['valor']) < 15
    if dose:
        (doses_f if r['dif'] < 0 else doses_s).append(r)
    else:
        (faltas if r['dif'] < 0 else sobras).append(r)
faltas.sort(key=lambda r: r['valor']); sobras.sort(key=lambda r: -r['valor'])
tot_f = sum(r['valor'] for r in faltas + doses_f); tot_s = sum(r['valor'] for r in sobras + doses_s)


def linha(r, cls):
    sub = ' · '.join([r['est']] + r['extra'] + ([notas[f"{r['est']}|{r['item']}"]] if f"{r['est']}|{r['item']}" in notas else []) + [brl(abs(r['valor']))])
    anterior = None if r['entrou'] is None else round(r['deveria'] - r['entrou'] + r['vendeu'], 3)
    ent = '–' if not r['entrou'] else num(r['entrou'])
    ven = '–' if r['vendeu'] is None else num(r['vendeu'])
    return (f"<tr><td class=\"item\">{e(r['nome'])}<small>{e(sub)}</small></td><td>{num(anterior)}</td><td>{ent}</td>"
            f"<td>{ven}</td><td class=\"exp\">{num(r['deveria'])}</td><td class=\"cnt\">{num(r['contado'])}</td>"
            f"<td><span class=\"pill {cls}\">{num(r['dif'], True)}</span></td></tr>")


def doses(ls):
    if not ls:
        return ''
    txt = ' · '.join(f"{nome_bonito(r['item'], r['um'], False).replace(' (garrafa)', '')} {num(r['dif'], True)}" for r in ls)
    return f"<tr><td class=\"item\" colspan=\"7\">Doses abertas no balcão<small>{e(txt)} · {brl(abs(sum(r['valor'] for r in ls)))}</small></td></tr>"


ant = cfg['anterior']
cab = f"<tr><th>Item</th><th>Contagem {e(ant)}</th><th>Entrou</th><th>Vendeu</th><th>Deveria</th><th>Contado</th><th>Dif.</th></tr>"

# ---------- 4. não é perda ----------
exp = cfg.get('explicados', {})
exp_linhas = ''.join(
    f"<tr><td class=\"item\">{e(x['item'])}<small>{e(x.get('sub', ''))}</small></td><td style=\"text-align:left;font-size:18px\">{x['oque']}</td>"
    f"<td><span class=\"pill {x.get('tipo', 'pos')}\">{e(x['ajuste'])}</span></td></tr>" for x in exp.get('linhas', []))
for item, txt in ignorar.items():
    exp_linhas += (f"<tr><td class=\"item\">{e(nome_bonito(item, 'unidade', False))}<small>fora do resultado</small></td>"
                   f"<td style=\"text-align:left;font-size:18px\">{txt}</td><td><span class=\"pill pos\">ok</span></td></tr>")
if sem_custo:
    lista = ' · '.join(f"{nome_bonito(a['item'], 'unidade', False)} {num(a['qtd'])}" for a in sem_custo)
    exp_linhas += (f"<tr><td class=\"item\">Vendido sem saldo no Bar<small>zerado sem custo</small></td>"
                   f"<td style=\"text-align:left;font-size:18px\">A Zig baixou no Bar doses ou garrafas que não estavam no saldo dele, e na contagem não havia garrafa aberta. "
                   f"Zerado sem custo, para não contar perda duas vezes: {e(lista)}.</td><td><span class=\"pill pos\">ok</span></td></tr>")
bloco_exp = ''
if exp_linhas:
    bloco_exp = f"""
  <div class="stella">
    <h2>{e(exp.get('titulo', 'Vendas de garrafa e cadastro da Zig (não é perda)'))}</h2>
    <p>{exp.get('texto', 'Diferenças explicadas por venda que a Zig não baixou certo, garrafa que saiu do Central sem requisição ou cadastro. Já corrigido no sistema.')}</p>
    <table>
      <tr><th>Item</th><th style="width:52%">O que houve</th><th>Ajuste</th></tr>{exp_linhas}
    </table>{f'<p style="margin-top:14px;margin-bottom:0">{exp["rodape"]}</p>' if exp.get('rodape') else ''}
  </div>"""

blocos = ''.join(f"""
  <div class="stella">
    <h2>{e(b['titulo'])}</h2>
    <p>{b['texto']}</p>{b.get('tabela', '')}
  </div>""" for b in cfg.get('blocos', []))


def chips(ls):
    return ''.join(f'<span class="chip">{e(n)} <b>{num(q)}</b></span>' for n, q in sorted(ls, key=lambda x: -x[1]))


transf = ''
if desceu:
    un = round(sum(q for _, q in desceu))
    transf += f"""
  <div class="ok">
    <h2><span class="dot"></span>Desceu do Central sem requisição</h2>
    <div class="chips">{chips(desceu)}</div>
    <p class="note">{num(un)} unidades. {cfg.get('nota_transf', 'O que sobrou no Bar é o que faltou no Central: não é perda. Já acertado no sistema.')}</p>
  </div>"""
if subiu:
    transf += f"""
  <div class="ok">
    <h2><span class="dot"></span>Lançado para o Bar, mas ficou no Central</h2>
    <div class="chips">{chips(subiu)}</div>
    <p class="note">{cfg.get('nota_subiu', 'A transferência foi registrada, mas a mercadoria ainda estava no Central na hora da contagem.')}</p>
  </div>"""

top = lambda ls: ' · '.join(f"{r['nome'].replace(' (garrafa)', '').replace(' (litros)', '')} {brl(abs(r['valor']))}" for r in ls[:3])
badges = ''.join(f"<span class=\"{'status' if b.get('tipo', 'ok') == 'ok' else 'pend'}\">{e(b['txt'])}</span>" for b in cfg.get('badges', [{'txt': '✓ Lançado e aprovado no sistema'}]))
n = dados.get('itens_por_estoque', {})
dicas = ''.join(f'<li>{d}</li>' for d in cfg.get('dicas', []))
css = (AQUI / 'estilo.css').read_text()

doc = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Contagem Bar e Central {e(cfg['data_curta'])}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{css}</style></head>
<body>
  <div class="top">
    <div><div class="tag">Ditado Popular · Bar e Central</div><h1>Faltas e sobras<br>da contagem</h1>{badges}</div>
    <div class="date">Contagem: <b>{e(cfg['data_curta'])} ({e(cfg['dia_semana'])})</b><br>Vendas Zig: <b>{e(cfg['vendas_zig'])}</b><br>Anterior: <b>{e(ant)}</b></div>
  </div>

  <div class="formula">
    Contagem {e(ant)} <span class="op">+</span> Entradas e transferências <span class="op">−</span> Vendas Zig <span class="op">=</span> <span class="res">Deveria ter</span> <span class="op">→ comparado com a contagem de hoje</span>
  </div>

  <div class="card">
    <h2><span class="dot" style="background:var(--red)"></span>Faltas: sumiu do estoque</h2>
    <p class="sub">Tinha que estar no estoque e não estava na contagem. Valores a custo.</p>
    <table>
{cab}
{''.join(linha(r, 'neg') for r in faltas)}{doses(doses_f)}
</table>
  </div>

  <div class="card">
    <h2><span class="dot" style="background:var(--green)"></span>Sobras: tem mais do que o sistema esperava</h2>
    <p class="sub">Normalmente é produto batido errado na Zig, garrafa que desceu sem registro ou drink feito diferente da ficha.</p>
    <table>
{cab}
{''.join(linha(r, 'pos') for r in sobras)}{doses(doses_s)}
</table>
  </div>
{bloco_exp}{blocos}{transf}

  <div class="totals">
    <div class="tot" style="background:var(--redbg);color:var(--red)"><div class="l">Faltas (a custo)</div><div class="v">{brl(abs(tot_f))}</div><div class="s">{e(top(faltas))}</div></div>
    <div class="tot" style="background:var(--greenbg);color:var(--green)"><div class="l">Sobras (a custo)</div><div class="v">{brl(tot_s)}</div><div class="s">{e(top(sobras))}</div></div>
  </div>

  <div class="tips">
    <h3>Para a próxima contagem fechar</h3>
    <ul>
      {dicas}
    </ul>
  </div>
  <div class="foot">Gerado a partir do Estoque Beta 2 · contagem de {e(dados['contagem'])} aprovada (Bar: {n.get('Bar', 0)} itens, Central: {n.get('Central', 0)} itens)</div>
</body></html>"""
Path(sys.argv[3]).write_text(doc)
print(f'faltas {tot_f:.2f} sobras {tot_s:.2f} desceu {len(desceu)} subiu {len(subiu)} linhas F{len(faltas)} S{len(sobras)} doses {len(doses_f)}/{len(doses_s)}')
