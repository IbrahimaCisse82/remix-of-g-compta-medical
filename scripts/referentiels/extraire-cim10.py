# Extraction de la CIM-10 FR (ATIH) depuis le PDF officiel converti par « pdftotext -layout ».
# Usage : pdftotext -layout AFSH1638462A_Annexe_I_26.pdf bo.txt && python3 extraire-cim10.py bo.txt cim10.json
# Codes à 3 caractères et sous-codes listés ; subdivisions partagées de 4e caractère (E10-E14, F10-F19, K25-K28,
# N00-N07, O03-O06, R83-R89) développées ; libellés relatifs complétés par celui de la catégorie.
import re, json, sys, collections
lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
CODE = re.compile(r'^\s{0,6}([A-Z]\d{2}(?:\.\d{1,2})?)([†*+]?)\s{2,}(\S.*?)\s*$')
SUB = re.compile(r'^\s{0,3}\.(\d)[†*]?\s+(\S.*?)\s*$')
BRUIT = re.compile(r'Classification Internationale des Maladies|^\s*\d+\s*$')
CHAP = [('I','A00','B99'),('II','C00','D48'),('III','D50','D89'),('IV','E00','E90'),('V','F00','F99'),('VI','G00','G99'),('VII','H00','H59'),('VIII','H60','H95'),('IX','I00','I99'),('X','J00','J99'),('XI','K00','K93'),('XII','L00','L99'),('XIII','M00','M99'),('XIV','N00','N99'),('XV','O00','O99'),('XVI','P00','P96'),('XVII','Q00','Q99'),('XVIII','R00','R99'),('XIX','S00','T98'),('XX','V01','Y98'),('XXI','Z00','Z99'),('XXII','U00','U99')]
def chapitre(c):
    for n,a,b in CHAP:
        if a <= c[:3] <= b: return n
    return None
RELATIF = re.compile(r"^(À|Au|Aux|Avec|Sans|De|Du|Des|D'|D’|Par|Pour|Chez|Sur|Dans|En|Et|Ou|Lors|Après|Selon|Non|Sous|Entre)\b", re.I)
codes = {}
parents = {}
groupes = []  # (debut, fin, [(n, libelle)])
courant = None
attente = None  # (code, idx) for continuation
dernier_cat = None
debut = next(i for i,l in enumerate(lines) if re.match(r'^\s*A00\.0\s', l))  # détail commence ici
# catégories (3 car.) : liste initiale + détail
for i,l in enumerate(lines):
    if BRUIT.search(l): continue
    m = CODE.match(l)
    if m:
        code, lib = m.group(1), re.sub(r'\s{2,}', ' ', re.sub(r'\s{3,}\d{1,4}$', '', m.group(3))).strip()
        lib = re.sub(r'\s*\[Voir.*$', '', lib)
        if len(code) == 3:
            courant = None
            parents.setdefault(code, lib) if i < debut else parents.__setitem__(code, lib)
            dernier_cat = code
            if i >= debut: codes[code] = lib
            attente = (code, l.index(m.group(3)))
        elif i >= debut:
            p = parents.get(code[:3], '')
            tete = next((w for w in re.findall(r"[A-Za-zÀ-ÿœŒ]{4,}", p) if not w.lower().startswith('autre')), '')[:5].lower()
            if RELATIF.match(lib) and p:
                lib = f"{p} {lib[0].lower()}{lib[1:]}"
            elif p and tete and tete not in lib.lower() and not lib.startswith('Autre'):
                lib = f"{p} — {lib}"
            codes[code] = lib
            attente = (code, l.index(m.group(3)))
        continue
    g = re.search(r'quatrième caractère avec les (?:rubriques|catégories) ([A-Z]\d{2})\s*[-–]\s*([A-Z]\d{2})', l)
    if g and i >= debut:
        courant = (g.group(1), g.group(2), []); groupes.append(courant); attente = None; continue
    s = SUB.match(l)
    if s and i >= debut:
        if courant is not None and all(n != s.group(1) for n, _ in courant[2]): courant[2].append((s.group(1), s.group(2)))
        attente = None; continue
    if 'Voir subdivisions en tête du groupe' in l and dernier_cat:
        pass
    # continuation d'un libellé : même colonne, commence en minuscule
    if attente and l.strip() and l[0] == ' ':
        col = len(l) - len(l.lstrip())
        t = l.strip()
        if abs(col - attente[1]) <= 1 and t[0].islower() and not t.startswith('•'):
            codes[attente[0]] = codes.get(attente[0], parents.get(attente[0], '')) + ' ' + re.sub(r'\s{2,}', ' ', re.sub(r'\s{3,}\d{1,4}$', '', t))
            if len(attente[0]) == 3: parents[attente[0]] = codes[attente[0]]
            continue
    attente = None
# subdivisions partagées E10–E14
ajouts = 0
for a, b, subs in groupes:
    for cat in sorted(p for p in parents if a <= p <= b):
        for n, t in subs:
            c = f'{cat}.{n}'
            if c not in codes:
                codes[c] = f"{parents[cat]}, {t[0].lower()}{t[1:]}"; ajouts += 1
print('groupes', [(a, b, len(x)) for a, b, x in groupes], 'ajouts', ajouts)
for c, l in parents.items():
    codes.setdefault(c, l)
out = [{'code': c, 'libelle': re.sub(r'\s+\d{3,4}$', '', re.sub(r'\s{2,}', ' ', l)).strip()[:500], 'chapitre': chapitre(c)} for c, l in sorted(codes.items())]
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False)
print(len(out), collections.Counter(len(o['code']) for o in out))
