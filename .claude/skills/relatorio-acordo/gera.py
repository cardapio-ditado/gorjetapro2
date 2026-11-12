#!/usr/bin/env python3
"""Relatório de pagamentos de um acordo trabalhista, no layout do relatório do Augusto (04/11/2026).

Uso: python3 gera.py <pasta_db> <id_do_acordo> <pasta_comprovantes> <config.json> <saida.html>
  pasta_db: saída do ArtifactData (out_dir) com acordos/, parcelas/ e comprovantes/
  pasta_comprovantes: arquivos baixados da Central, cada um com o nome <id do asset>.<ext>
"""
import base64, glob, json, os, subprocess, sys, tempfile
from datetime import date, timedelta
from html import escape as e

MESES = 'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro'.split()
# Os mesmos feriados da página da Central (nacionais, Carnaval, Corpus Christi e aniversário de Cuiabá).
FERIADOS = set('''2025-01-01 2025-03-03 2025-03-04 2025-04-08 2025-04-18 2025-04-21 2025-05-01 2025-06-19 2025-09-07 2025-10-12 2025-11-02 2025-11-15 2025-11-20 2025-12-25
2026-01-01 2026-02-16 2026-02-17 2026-04-03 2026-04-08 2026-04-21 2026-05-01 2026-06-04 2026-09-07 2026-10-12 2026-11-02 2026-11-15 2026-11-20 2026-12-25
2027-01-01 2027-02-08 2027-02-09 2027-03-26 2027-04-08 2027-04-21 2027-05-01 2027-05-27 2027-09-07 2027-10-12 2027-11-02 2027-11-15 2027-11-20 2027-12-25'''.split())


def brl(v, cifrao=True):
    s = f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return ('R$ ' if cifrao else '') + s

def dt(iso): return date.fromisoformat(iso[:10])
def br(iso, curto=False): d = dt(iso); return d.strftime('%d/%m/%y' if curto else '%d/%m/%Y')

def venc_util(iso):
    """Vencimento em sábado, domingo ou feriado passa para o dia útil seguinte (art. 132, §1º, CC)."""
    d = dt(iso)
    while d.weekday() >= 5 or d.isoformat() in FERIADOS: d += timedelta(days=1)
    return d

def faixa_de(clausula, atraso):
    for f in (clausula or {}).get('faixas', []):
        if f.get('ate') is None or atraso <= f['ate']: return f
    return None

def texto_regra(clausula):
    ini, partes = 1, []
    for f in (clausula or {}).get('faixas', []):
        quando = f'acima de {ini - 1} dias' if f.get('ate') is None else (f'até {f["ate"]} dias' if ini == 1 else f'{ini} a {f["ate"]} dias')
        oque = f.get('texto') or (f'{f["pct"]}% do saldo restante e vencimento antecipado das demais' if f.get('base') == 'saldo' else f'{f["pct"]}% da parcela')
        partes.append(f'{quando} {oque}'); ini = (f.get('ate') or 0) + 1
    return '; '.join(partes)

def calcular(acordo, parcelas, comps, hoje):
    linhas = []
    for p in sorted(parcelas, key=lambda x: x['n']):
        cs = sorted([c for c in comps if c.get('parcela') == p['id']], key=lambda c: (c['data'], c['id']))
        pags = [dict(data=c['data'], valor=float(c['valor']), pix=c.get('valor_pix'), sobra=bool(c.get('sobra_de')), sem=False) for c in cs]
        fin = p.get('fin') or {}
        if not pags:  # paga pelo financeiro (ou por fora) e sem comprovante na Central
            if fin.get('status') == 'pago' and not p.get('fin_de_outra'):
                pags = [dict(data=x['data'], valor=float(x['valor']), pix=None, sobra=False, sem=True) for x in fin.get('pagamentos', [])]
            elif p.get('pago_fora'):
                pags = [dict(data=p['pago_fora']['data'], valor=float(p['pago_fora']['valor']), pix=None, sobra=False, sem=True)]
        valor, base = float(p['valor']), float(p.get('valor_ata') or p['valor'])
        soma, quit_em = 0.0, None
        for g in pags:
            soma += g['valor']
            if quit_em is None and soma >= valor - 0.01: quit_em = g['data']
            g['passa'] = round(min(g['valor'], soma - valor), 2) if soma > valor + 0.01 else 0  # pago a mais: vai para a parcela seguinte
        vu = venc_util(p['venc'])
        if quit_em: atraso, sit = max(0, (dt(quit_em) - vu).days), 'paga'
        elif hoje > vu: atraso, sit = (hoje - vu).days, 'parcial' if soma > 0.01 else 'em aberto'
        else: atraso, sit = None, 'parcial' if soma > 0.01 else 'a vencer'
        f = faixa_de(acordo.get('clausula'), atraso) if atraso else None
        multa = round(base * f['pct'] / 100, 2) if f and f.get('pct') is not None and f.get('base') != 'saldo' else None
        linhas.append(dict(p=p, comps=cs, pags=pags, valor=valor, base=base, pago=min(soma, valor), quit=quit_em, atraso=atraso, sit=sit,
                           faixa=f, multa=multa, vencida=not quit_em and hoje > vu, sistema=fin.get('titulo') or '—'))
    return linhas

def imagem(pasta, asset):
    """Primeira página do comprovante como imagem embutida (PDF passa pelo pdftoppm)."""
    achados = glob.glob(os.path.join(pasta, asset + '.*')) + glob.glob(os.path.join(pasta, asset))
    if not achados: return None, False
    arq = achados[0]; ext = os.path.splitext(arq)[1].lower()
    eh_pdf = ext == '.pdf' or open(arq, 'rb').read(4) == b'%PDF'
    if eh_pdf:
        tmp = os.path.join(tempfile.mkdtemp(), 'c')
        subprocess.run(['pdftoppm', '-r', '80', '-png', '-f', '1', '-l', '1', '-singlefile', arq, tmp], check=True)
        arq, ext = tmp + '.png', '.png'
    mime = 'image/png' if ext == '.png' else 'image/jpeg'
    return f'data:{mime};base64,' + base64.b64encode(open(arq, 'rb').read()).decode(), eh_pdf

def montar(acordo, linhas, cfg, pasta_comp, hoje):
    total = sum(l['base'] for l in linhas); pago = sum(l['pago'] for l in linhas); aberto = round(total - pago, 2)
    quit_ = [l for l in linhas if l['quit']]
    media = round(sum(l['atraso'] for l in quit_) / len(quit_)) if quit_ else None
    grupos = {}
    for l in linhas: grupos[l['base']] = grupos.get(l['base'], 0) + 1
    composicao = ' + '.join(f'{n} × {brl(v)}' for v, n in grupos.items())
    prox = next((l for l in linhas if not l['quit']), None)
    nome = acordo.get('nome', '')
    dados = cfg.get('dados') or [
        ['Processo', ' · '.join(x for x in [acordo.get('processo'), acordo.get('vara')] if x)],
        ['Partes', f'{nome} × {acordo.get("empresa", "")}'], ['Valor', acordo.get('obs', '')], ['Pagamento', acordo.get('pago_a', '')],
        ['Advogados', f'Reclamante: {acordo.get("advogado", "")} · Reclamada: {acordo.get("advogado_empresa", "")}']]
    notas = [['Como foi calculado.', 'Atraso em dias corridos entre o vencimento e o dia em que a parcela ficou quitada; vencimento em sábado, domingo ou feriado '
              'passa para o dia útil seguinte (art. 132, §1º, do Código Civil). Faixas da cláusula penal: ' + texto_regra(acordo.get('clausula')) + '. '
              'A coluna “Multa máx.” é o teto pela regra, somado só nas faixas sobre a parcela; só é devida se o reclamante pedir ao juiz, e o juiz pode reduzir (art. 413 do Código Civil).']] + cfg.get('notas', [])

    def pag_txt(g):
        t = f'<span class="pg">{br(g["data"], True)} {brl(g["valor"], False)}</span>'
        if g['pix'] and abs(g['pix'] - g['valor']) > 0.01: t += f'<span class="m">(Pix de {brl(g["pix"])})</span>'
        if g['passa']: t += f'<span class="m">({brl(g["passa"])} vão para a parcela seguinte)</span>'
        if g['sobra']: t += '<span class="m">(sobra do Pix da parcela anterior)</span>'
        if g['sem']: t += '<span class="m">(sem comprovante)</span>'
        return t

    def linha(l):
        p = l['p']; d = dt(p['venc'])
        sit = {'paga': f'paga<span class="m">quitada em {br(l["quit"])}</span>' if l['quit'] else '', 'parcial': f'parcial<span class="m">faltam {brl(l["valor"] - l["pago"])}</span>'}.get(l['sit'], l['sit'])
        atraso = '—' if l['atraso'] is None else 'em dia' if l['atraso'] == 0 else f'{l["atraso"]} dias' + ('' if l['quit'] else '<span class="m">(até hoje)</span>')
        f = l['faixa']
        faixa = ('em dia' if l['atraso'] == 0 else '—') if not f else f'<b class="fx">{e(f.get("texto") or (str(f["pct"]) + ("% do saldo" if f.get("base") == "saldo" else "% da parcela")))}</b>'
        return (f'<tr class="{"aberta" if l["vencida"] else ""}"><td>{p["n"]}</td><td>{MESES[d.month - 1]}/{d.year}</td><td>{br(p["venc"])}</td><td class="v">{brl(l["base"])}</td>'
                f'<td>{"".join(pag_txt(g) for g in l["pags"]) or "—"}</td><td class="v">{brl(l["pago"])}</td><td>{sit}</td><td>{atraso}</td><td>{faixa}</td>'
                f'<td class="v">{brl(l["multa"]) if l["multa"] else "—"}</td><td class="m">{e(l["sistema"])}</td></tr>')

    def anexo(l):
        p = l['p']; d = dt(p['venc']); cs = [c for c in l['comps'] if c.get('asset')]
        tot = sum(float(c['valor']) for c in cs); passa = sum(g['passa'] for g in l['pags'])
        resumo = f'{len(cs)} comprovante(s) · total {brl(tot)}' + (f' ({brl(passa)} vão para a parcela seguinte)' if passa else '') if cs else 'sem comprovante'
        cab = f'<div class="faixa"><b>Parcela {p["n"]} · {MESES[d.month - 1]}/{d.year}</b> · vencimento {br(p["venc"])} · {resumo}</div>'
        cartoes = ''
        for c in cs:
            img, eh_pdf = imagem(pasta_comp, c['asset'])
            pix = f' <span class="m">· Pix de {brl(c["valor_pix"])}</span>' if c.get('valor_pix') and abs(c['valor_pix'] - float(c['valor'])) > 0.01 else ''
            # print de celular aparece inteiro; página de PDF mostra a parte de cima, na largura do cartão
            foto = f'<img src="{img}" alt=""{"" if eh_pdf else " class=foto"}>' if img else '<div class="semimg">arquivo não baixado</div>'
            obs = f'<i>{e(c["obs"])}</i>' if c.get('obs') else ''
            cartoes += f'<figure>{foto}<figcaption><b>{br(c["data"])} · {brl(float(c["valor"]))}</b>{pix}<br>{e(c.get("descricao") or "")}{obs}</figcaption></figure>'
        extras = [f'{br(g["data"])} · {brl(g["valor"])}: pago, sem comprovante na Central' for g in l['pags'] if g['sem']]
        extras += [f'{br(c["data"])} · {brl(float(c["valor"]))}: {e(c.get("descricao") or "sem arquivo")}' for c in l['comps'] if not c.get('asset')]
        if not cs and not extras: return ''
        return f'<section class="par">{cab}<div class="grade">{cartoes}</div>{"".join(f"<p class=semcomp>{x}</p>" for x in extras)}</section>'

    css = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'estilo.css'), encoding='utf-8').read()
    return f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Acordo {e(nome)} · relatório de pagamentos</title><style>{css}</style></head><body>
<header><div><h1>Acordo trabalhista · {e(nome)}</h1><p class="para">Relatório de pagamentos para o {e(cfg.get("destinatario", "Dr. Rodolpho Vasconcellos Dias"))}</p></div>
<div class="emit">Ditado Popular<br>emitido em {hoje.strftime("%d/%m/%Y")}</div></header>
<div class="cards">
<div><span>Valor do acordo</span><b>{brl(total)}</b><small>{composicao}</small></div>
<div><span>Pago</span><b>{brl(pago)}</b><small>{len(quit_)} de {len(linhas)} parcelas quitadas</small></div>
<div class="{"ab" if aberto > 0.009 else ""}"><span>Em aberto</span><b>{brl(aberto)}</b><small>{f"parc. {prox['p']['n']} (venc. {br(prox['p']['venc'])})" if prox else "acordo quitado"}</small></div>
<div><span>Atraso médio</span><b>{"—" if media is None else f"{media} dias"}</b><small>entre vencimento e quitação</small></div></div>
<h2>Dados do acordo</h2><dl>{"".join(f"<dt>{e(k)}</dt><dd>{e(v)}</dd>" for k, v in dados if v)}</dl>
<h2>Parcela a parcela</h2>
<table><thead><tr><th>Nº</th><th>Referente</th><th>Vencimento</th><th>Valor</th><th>Pagamentos (Pix)</th><th>Pago</th><th>Situação</th><th>Atraso</th><th>Faixa da multa</th><th>Multa máx.</th><th>No sistema</th></tr></thead>
<tbody>{"".join(linha(l) for l in linhas)}
<tr class="tot"><td colspan="3">TOTAL</td><td class="v">{brl(total)}</td><td></td><td class="v">{brl(pago)}</td><td colspan="3"></td><td class="v">{brl(sum(l["multa"] or 0 for l in linhas))}</td><td></td></tr></tbody></table>
{"".join(f"<p class=nota><b>{e(t)}</b> {e(x)}</p>" for t, x in notas)}
<h2 class="anexo">Anexo · comprovantes por mês</h2>{"".join(anexo(l) for l in linhas)}
</body></html>'''

if __name__ == '__main__':
    pasta_db, aid, pasta_comp, cfg_arq, saida = sys.argv[1:6]
    ler = lambda arq: {**json.load(open(arq, encoding='utf-8')), 'id': os.path.splitext(os.path.basename(arq))[0]}
    acordo = ler(os.path.join(pasta_db, 'acordos', aid + '.json'))
    parcelas = [x for x in map(ler, glob.glob(os.path.join(pasta_db, 'parcelas', '*.json'))) if x.get('acordo') == aid]
    comps = [x for x in map(ler, glob.glob(os.path.join(pasta_db, 'comprovantes', '*.json'))) if x.get('acordo') == aid]
    cfg = json.load(open(cfg_arq, encoding='utf-8'))
    hoje = dt(cfg['emitido']) if cfg.get('emitido') else date.today()
    assert parcelas, f'nenhuma parcela do acordo {aid} em {pasta_db}/parcelas'
    linhas = calcular(acordo, parcelas, comps, hoje)
    # conferência: o que está pago nunca passa do valor do acordo, e toda parcela quitada tem data
    assert sum(l['pago'] for l in linhas) <= sum(l['valor'] for l in linhas) + 0.01
    assert all(l['quit'] for l in linhas if l['sit'] == 'paga')
    open(saida, 'w', encoding='utf-8').write(montar(acordo, linhas, cfg, pasta_comp, hoje))
    print(f'{saida}: {len(linhas)} parcelas, pago {brl(sum(l["pago"] for l in linhas))} de {brl(sum(l["base"] for l in linhas))}, '
          f'{sum(1 for c in comps if c.get("asset"))} comprovantes com arquivo')
