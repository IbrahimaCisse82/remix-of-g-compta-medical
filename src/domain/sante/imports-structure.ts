import Papa from 'papaparse';

// Imports tableur pour le paramétrage réel d'une structure (lot 3) : équipe à inviter, actes et tarifs.
// Les contrôles serveur restent la référence ; ceux-ci signalent les erreurs avant l'envoi.

export const ROLES = ['admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire', 'caissier', 'comptable', 'lecteur', 'tiers_payant'] as const;
export type Role = typeof ROLES[number];
export type TypeStructure = 'cabinet' | 'laboratoire' | 'mixte';

/** Même règle que la base (sante_equipe_modifier) : pas de biologie en cabinet, pas de médecin en laboratoire. */
export function roleCompatible(role: Role, type: TypeStructure): boolean {
  if (type === 'cabinet') return !['biologiste', 'technicien', 'preleveur'].includes(role);
  if (type === 'laboratoire') return role !== 'medecin';
  return true;
}

const ALIAS: Record<string, Role> = {
  administrateur: 'admin_structure', admin: 'admin_structure', 'admin structure': 'admin_structure',
  médecin: 'medecin', medecin: 'medecin', biologiste: 'biologiste', technicien: 'technicien',
  préleveur: 'preleveur', preleveur: 'preleveur', secrétaire: 'secretaire', secretaire: 'secretaire',
  caissier: 'caissier', caissière: 'caissier', comptable: 'comptable', lecteur: 'lecteur',
  'tiers payant': 'tiers_payant', tiers_payant: 'tiers_payant',
};
export const lireRole = (v: string): Role | null => ALIAS[v.trim().toLowerCase().replace(/\s+/g, ' ')] ?? (ROLES.includes(v.trim() as Role) ? v.trim() as Role : null);

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const sep = (t: string) => Papa.parse<string[]>(t.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimiter: '' });
const colonnes = (entete: string[] | undefined) => (entete ?? []).map(c => c.trim().toLowerCase());
const csv = (lignes: string[][]) => '\uFEFF' + Papa.unparse(lignes, { delimiter: ';', newline: '\r\n' });

// ───────── Équipe ─────────
export interface Invitation { nom: string; email: string; role: Role }
export const MODELE_EQUIPE = csv([['nom', 'email', 'roles'], ['Awa Diop', 'awa.diop@exemple.sn', 'secrétaire'], ['Dr Moussa Fall', 'm.fall@exemple.sn', 'médecin + administrateur']]);

/** Une invitation par rôle (un collaborateur à deux rôles reçoit deux liens). Ignore ce qui est déjà en attente. */
export function lireEquipe(texte: string, type: TypeStructure, enAttente: { email: string; role: string }[]) {
  const p = sep(texte);
  const [entete, ...corps] = p.data;
  const cols = colonnes(entete);
  const [iNom, iMail, iRoles] = ['nom', 'email', 'roles'].map(c => cols.indexOf(c));
  if (iMail < 0 || iRoles < 0) throw new Error('Colonnes email et roles obligatoires. Partez du modèle téléchargé.');
  const deja = new Set(enAttente.map(x => `${x.email.toLowerCase()}|${x.role}`));
  const invitations: Invitation[] = [], erreurs: string[] = [];
  let ignorees = 0;
  corps.forEach((l, i) => {
    const n = i + 2, email = (l[iMail] ?? '').trim().toLowerCase(), nom = iNom >= 0 ? (l[iNom] ?? '').trim() : '';
    if (!email && !(l[iRoles] ?? '').trim()) return;
    if (!EMAIL.test(email)) return void erreurs.push(`Ligne ${n} : adresse e-mail invalide (« ${email} »).`);
    const brut = (l[iRoles] ?? '').split(/[+,/]| et /).map(s => s.trim()).filter(Boolean);
    if (!brut.length) return void erreurs.push(`Ligne ${n} : aucun rôle.`);
    for (const r of brut) {
      const role = lireRole(r);
      if (!role) { erreurs.push(`Ligne ${n} : rôle « ${r} » inconnu.`); continue; }
      if (!roleCompatible(role, type)) { erreurs.push(`Ligne ${n} : rôle « ${r} » impossible dans un ${type}.`); continue; }
      const cle = `${email}|${role}`;
      if (deja.has(cle)) { ignorees++; continue; }
      deja.add(cle); invitations.push({ nom, email, role });
    }
  });
  return { invitations, erreurs, ignorees, personnes: new Set(invitations.map(x => x.email)).size };
}

// ───────── Actes et tarifs ─────────
export interface Acte { code: string; libelle: string; tarif: number; categorie: string | null }
export const MODELE_ACTES = csv([['code', 'libelle', 'tarif', 'categorie'], ['CS', 'Consultation de médecine générale', '', 'consultation'], ['ECG', 'Électrocardiogramme', '', 'examen']]);

export function lireActes(texte: string) {
  const p = sep(texte);
  const [entete, ...corps] = p.data;
  const cols = colonnes(entete);
  const [iCode, iLib, iTarif, iCat] = ['code', 'libelle', 'tarif', 'categorie'].map(c => cols.indexOf(c));
  if (iCode < 0 || iLib < 0 || iTarif < 0) throw new Error('Colonnes code, libelle et tarif obligatoires. Partez du modèle téléchargé.');
  const actes: Acte[] = [], erreurs: string[] = [], vus = new Set<string>();
  corps.forEach((l, i) => {
    const n = i + 2, code = (l[iCode] ?? '').trim().toUpperCase(), libelle = (l[iLib] ?? '').trim();
    const t = (l[iTarif] ?? '').trim().replace(/[\s\u00a0\u202f]/g, '').replace(/fcfa$/i, '');
    if (!code && !libelle && !t) return;
    if (!code || !libelle) return void erreurs.push(`Ligne ${n} : code et libellé obligatoires.`);
    if (vus.has(code)) return void erreurs.push(`Ligne ${n} : code « ${code} » en double dans le fichier.`);
    const tarif = Number(t);
    if (!t || !Number.isSafeInteger(tarif) || tarif < 0) return void erreurs.push(`Ligne ${n} : tarif en FCFA entier attendu (« ${l[iTarif] ?? ''} »).`);
    vus.add(code);
    actes.push({ code, libelle, tarif, categorie: iCat >= 0 ? ((l[iCat] ?? '').trim() || null) : null });
  });
  return { actes, erreurs };
}
