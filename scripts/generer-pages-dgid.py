#!/usr/bin/env python3
"""
Génère la mise en page HTML de chaque onglet du modèle DGID (public/modeles/etats-financiers-dgid.xlsx)
pour l'impression PDF de la liasse : public/modeles/etats-financiers-dgid-pages.json.

Chaque cellule du tableau porte data-a="F12" : l'application y écrit les montants calculés depuis la
balance. Les formules du modèle (renvois d'en-tête, SUM) sont exportées à part pour être évaluées.
Rendu noir et blanc : les trames de couleur deviennent des gris clairs.

Usage : python3 scripts/generer-pages-dgid.py
"""
import html
import json
import re
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter, range_boundaries

RACINE = Path(__file__).resolve().parent.parent
MODELE = RACINE / 'public/modeles/etats-financiers-dgid.xlsx'
SORTIE = RACINE / 'public/modeles/etats-financiers-dgid-pages.json'
EXCLUS = {'Codes activités'}
# Onglets dont la zone utile s'arrête avant des colonnes parasites du modèle.
COLONNE_MAX = {'Note 5': 7}
# Ligne 1 = nom d'onglet, hors document imprimé.
PREMIERE_LIGNE = {'Page de garde': 2}
PX_PAR_LARGEUR = 7.0     # largeur de colonne Excel → pixels
PX_PAR_POINT = 1.333

BORDURES = {'thin': '1px solid #000', 'hair': '1px solid #000', 'dotted': '1px dotted #000', 'dashed': '1px dashed #000',
            'medium': '2px solid #000', 'mediumDashed': '2px dashed #000', 'thick': '3px solid #000', 'double': '3px double #000',
            'dashDot': '1px dashed #000', 'mediumDashDot': '2px dashed #000', 'dashDotDot': '1px dashed #000', 'slantDashDot': '2px dashed #000'}


def blanc(couleur):
    """Bordure blanche (masquage du quadrillage) : ignorée."""
    if couleur is None:
        return False
    if couleur.type == 'indexed':
        return couleur.indexed in (9, 1)
    if couleur.type == 'rgb' and isinstance(couleur.rgb, str):
        return couleur.rgb.upper().endswith('FFFFFF')
    if couleur.type == 'theme':
        return couleur.theme == 0 and not couleur.tint
    return False


def trait(bord):
    return bord is not None and bord.style and not blanc(bord.color)


def bornes(ws):
    """Zone imprimée : zone d'impression du modèle, élargie aux lignes 1 à 5 (identification)."""
    if ws.print_area:
        zone = ws.print_area if isinstance(ws.print_area, str) else ws.print_area[0]
        zone = zone.split('!')[-1].replace('$', '')
        c1, r1, c2, r2 = range_boundaries(zone)
        # Zone d'impression commençant après l'identification (bilan, CR, TFT) : reprendre depuis le titre.
        return 1, r1 if r1 <= 4 else 1, c2, r2
    c2 = r2 = 1
    limite = COLONNE_MAX.get(ws.title, 60)
    premiere = PREMIERE_LIGNE.get(ws.title, 1)
    for row in ws.iter_rows(max_col=limite):
        for c in row:
            if c.value not in (None, '') or (c.border and (trait(c.border.left) or trait(c.border.top) or trait(c.border.bottom))):
                c2, r2 = max(c2, c.column), max(r2, c.row)
    return 1, premiere, c2, r2


def style_cellule(c):
    s = []
    f = c.font
    if f is not None:
        if f.b: s.append('font-weight:bold')
        if f.i: s.append('font-style:italic')
        if f.u: s.append('text-decoration:underline')
        if f.sz: s.append(f'font-size:{round(float(f.sz) * 0.8, 1)}pt')
    a = c.alignment
    if a is not None:
        if a.horizontal in ('center', 'centerContinuous'): s.append('text-align:center')
        elif a.horizontal == 'right': s.append('text-align:right')
        elif a.horizontal == 'left': s.append('text-align:left')
        if a.vertical == 'top': s.append('vertical-align:top')
        elif a.vertical == 'center': s.append('vertical-align:middle')
        if a.wrap_text: s.append('white-space:normal')
        if a.indent: s.append(f'padding-left:{int(a.indent) * 6}px')
    b = c.border
    if b is not None:
        for cote, bord in (('top', b.top), ('right', b.right), ('bottom', b.bottom), ('left', b.left)):
            if trait(bord):
                s.append(f'border-{cote}:{BORDURES.get(bord.style, "1px solid #000")}')
    fi = c.fill
    if fi is not None and fi.fill_type == 'solid':
        teinte = getattr(fi.fgColor, 'tint', 0) or 0
        rgb = fi.fgColor.rgb if fi.fgColor.type == 'rgb' and isinstance(fi.fgColor.rgb, str) else None
        if rgb and rgb.upper() in ('FFFFFFFF', '00FFFFFF', '00000000'):
            pass
        else:
            s.append('background:#d9d9d9' if teinte < 0 else 'background:#efefef')
    return ';'.join(s)


def texte(c):
    v = c.value
    if v is None:
        return ''
    if isinstance(v, str) and v.startswith('='):
        return ''
    if hasattr(v, 'strftime'):
        return v.strftime('%d/%m/%Y')
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def page(ws):
    c1, r1, c2, r2 = bornes(ws)
    fusions = {}
    masquees = set()
    for m in ws.merged_cells.ranges:
        if m.min_col > c2 or m.min_row > r2 or m.max_col < c1 or m.max_row < r1:
            continue
        mc1, mr1, mc2, mr2 = max(m.min_col, c1), max(m.min_row, r1), min(m.max_col, c2), min(m.max_row, r2)
        fusions[(mr1, mc1)] = (mr2 - mr1 + 1, mc2 - mc1 + 1, m)
        for r in range(mr1, mr2 + 1):
            for c in range(mc1, mc2 + 1):
                if (r, c) != (mr1, mc1):
                    masquees.add((r, c))
    defaut = ws.sheet_format.defaultColWidth or 9.14
    # Les largeurs sont stockées par groupes de colonnes (min..max).
    groupes = [(d.min or 0, d.max or 0, d) for d in ws.column_dimensions.values()]
    def dim(c):
        for mn, mx, d in groupes:
            if mn <= c <= mx:
                return d
        return None
    largeurs = []
    for c in range(c1, c2 + 1):
        d = dim(c)
        largeurs.append(0 if d is not None and d.hidden else round(((d.width if d is not None and d.width else defaut) or defaut) * PX_PAR_LARGEUR))
    styles, formules, lignes = {}, {}, []
    hauteur = 0
    for r in range(r1, r2 + 1):
        d = ws.row_dimensions.get(r)
        if d is not None and d.hidden:
            continue
        h = round(((d.height if d is not None and d.height else (ws.sheet_format.defaultRowHeight or 15))) * PX_PAR_POINT)
        hauteur += h
        cellules = []
        for c in range(c1, c2 + 1):
            if (r, c) in masquees or largeurs[c - c1] == 0:
                continue
            cell = ws.cell(r, c)
            st = style_cellule(cell)
            fus = fusions.get((r, c))
            if fus:
                # Bordures d'une fusion : prendre aussi celles de la dernière ligne / colonne.
                _, _, m = fus
                bas = ws.cell(m.max_row, c).border
                droite = ws.cell(r, m.max_col).border
                if bas is not None and trait(bas.bottom) and 'border-bottom' not in st:
                    st += f';border-bottom:{BORDURES.get(bas.bottom.style, "1px solid #000")}'
                if droite is not None and trait(droite.right) and 'border-right' not in st:
                    st += f';border-right:{BORDURES.get(droite.right.style, "1px solid #000")}'
            cls = styles.setdefault(st, f's{len(styles)}') if st else ''
            attrs = f' data-a="{cell.coordinate}"'
            if cls: attrs += f' class="{cls}"'
            if fus:
                rs, cs, _ = fus
                if rs > 1: attrs += f' rowspan="{rs}"'
                if cs > 1: attrs += f' colspan="{cs}"'
            v = cell.value
            if isinstance(v, str) and v.startswith('='):
                formules[cell.coordinate] = v[1:]
            num = isinstance(v, (int, float)) and not isinstance(v, bool)
            contenu = html.escape(texte(cell)).replace('\n', '<br>')
            if num and 'text-align' not in st:
                attrs += ' style="text-align:right"'
            cellules.append(f'<td{attrs}>{contenu}</td>')
        lignes.append(f'<tr style="height:{h}px">' + ''.join(cellules) + '</tr>')
    cols = ''.join(f'<col style="width:{w}px">' for w in largeurs if w)
    largeur = sum(largeurs)
    table = f'<table class="feuille" style="width:{largeur}px"><colgroup>{cols}</colgroup>' + ''.join(lignes) + '</table>'
    css = ''.join(f'.p{{id}} .{cls}{{{st}}}' for st, cls in styles.items())
    paysage = ws.page_setup.orientation == 'landscape'
    return {'nom': ws.title, 'paysage': paysage, 'largeur': largeur, 'hauteur': hauteur, 'html': table, 'css': css, 'formules': formules}


def main():
    wb = openpyxl.load_workbook(MODELE)
    pages = []
    statiques = {}
    for i, ws in enumerate(wb.worksheets):
        if ws.title in EXCLUS:
            continue
        p = page(ws)
        p['css'] = p['css'].replace('{id}', str(i))
        p['id'] = i
        pages.append(p)
        # Valeurs fixes du modèle utiles aux formules (cibles des renvois).
        for f in p['formules'].values():
            for feuille, adr in re.findall(r"(?:'((?:[^']|'')+)'!|\b)\$?([A-Z]{1,3}\$?\d+)", f):
                cible = wb[feuille.replace("''", "'")] if feuille else ws
                cell = cible[adr.replace('$', '')]
                if cell.value is not None and not (isinstance(cell.value, str) and cell.value.startswith('=')):
                    statiques.setdefault(cible.title, {})[cell.coordinate] = texte(cell)
    SORTIE.write_text(json.dumps({'pages': pages, 'statiques': statiques}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(pages)} pages, {SORTIE.stat().st_size // 1024} Ko → {SORTIE.relative_to(RACINE)}')


if __name__ == '__main__':
    main()
