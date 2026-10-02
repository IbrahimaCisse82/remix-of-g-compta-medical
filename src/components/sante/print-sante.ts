import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { LIBELLE_DRAPEAU, type Drapeau } from '@/domain/sante/reference';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const STYLE = `@page{size:A4;margin:16mm}body{font-family:Georgia,serif;color:#111;font-size:11pt}header{display:flex;justify-content:space-between;border-bottom:2px solid #0e7490;padding-bottom:8px}
h1{font-size:16pt;margin:0;color:#0e7490}h2{font-size:13pt;text-align:center;letter-spacing:2px;margin:24px 0}small{color:#444}table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border-bottom:1px solid #ddd;padding:5px;text-align:left}th{background:#f1f5f9;font-size:9pt}.anormal{font-weight:bold}.crit{color:#b91c1c;font-weight:bold}
.sig{margin-top:50px;text-align:right}footer{position:fixed;bottom:0;left:0;right:0;font-size:8pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:4px}`;

const entete = (s: any, droite: string) => `<header><div><h1>${esc(s.nom)}</h1><small>${esc(s.adresse)}<br>Tél. ${esc(s.telephone)}</small></div><div style="text-align:right">${droite}</div></header>`;
const pied = (s: any) => `<footer>NINEA ${esc(s.ninea)} · RCCM ${esc(s.rccm)}${s.autorisation_exercice ? ' · Autorisation ' + esc(s.autorisation_exercice) : ''} · Document émis électroniquement, non modifiable</footer>`;

function ouvrir(titre: string, corps: string) {
  const w = window.open('', '_blank');
  if (!w) return toast.error('Autorisez les fenêtres pour imprimer');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title><style>${STYLE}</style></head><body>${corps}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

const TYPES: Record<string, string> = { aptitude: "CERTIFICAT D'APTITUDE", arret_travail: "CERTIFICAT D'ARRÊT DE TRAVAIL", repos: 'CERTIFICAT DE REPOS', constat: 'CERTIFICAT DE CONSTATATION', autre: 'CERTIFICAT MÉDICAL' };

export async function imprimerCertificat(id: string) {
  const { data: c } = await supabase.from('sante_certificats')
    .select('*, patient:sante_patients(nom, prenoms, date_naissance, numero_dossier), praticien:sante_praticiens(nom, specialite, numero_ordre), structure:structures(nom, adresse, telephone, ninea, rccm, autorisation_exercice)')
    .eq('id', id).maybeSingle();
  if (!c) return toast.error('Certificat introuvable');
  const s: any = c.structure, p: any = c.patient, pr: any = c.praticien;
  ouvrir(`Certificat ${c.numero}`, `${entete(s, `<strong>${esc(pr.nom)}</strong><br><small>${esc(pr.specialite)}<br>N° Ordre : ${esc(pr.numero_ordre)}</small>`)}
<h2>${TYPES[c.type] ?? 'CERTIFICAT MÉDICAL'}</h2><p style="text-align:right"><small>N° ${esc(c.numero)}</small></p>
<p>Je soussigné(e), <strong>${esc(pr.nom)}</strong>, certifie avoir examiné ce jour <strong>${esc(p.nom)} ${esc(p.prenoms)}</strong>${p.date_naissance ? ', né(e) le ' + new Date(p.date_naissance).toLocaleDateString('fr-FR') : ''}.</p>
<p style="white-space:pre-wrap">${esc(c.contenu)}</p>
${c.jours_arret ? `<p>Un arrêt de travail de <strong>${c.jours_arret} jour(s)</strong> est prescrit à compter de ce jour.</p>` : ''}
<p>Certificat établi à la demande de l'intéressé(e) et remis en main propre pour servir et valoir ce que de droit.</p>
<div class="sig">Fait le ${new Date(c.emis_le).toLocaleDateString('fr-FR')}<br>Signature et cachet<br><br><strong>${esc(pr.nom)}</strong></div>${pied(s)}`);
}

export async function imprimerCompteRendu(demandeId: string) {
  const { data: d } = await supabase.from('sante_demandes_labo')
    .select('*, patient:sante_patients(nom, prenoms, sexe, date_naissance, numero_dossier), structure:structures(nom, adresse, telephone, ninea, rccm, autorisation_exercice)')
    .eq('id', demandeId).maybeSingle();
  if (!d) return toast.error('Demande introuvable');
  const [{ data: das }, { data: res }] = await Promise.all([
    supabase.from('sante_demande_analyses').select('analyse:sante_analyses(id, libelle, section, parametres:sante_analyse_parametres(id, libelle, unite, decimales, ordre))').eq('demande_id', demandeId),
    supabase.from('sante_resultats').select('*').eq('demande_id', demandeId),
  ]);
  const byParam = new Map((res ?? []).map(r => [r.parametre_id, r]));
  const s: any = d.structure, p: any = d.patient;
  const verif = `${window.location.origin}/?verif=${encodeURIComponent(d.numero)}`;
  const qr = await QRCode.toDataURL(verif, { width: 140, margin: 0 });
  const blocs = (das ?? []).map((x: any) => {
    const a = x.analyse;
    const lignes = [...a.parametres].sort((u: any, v: any) => u.ordre - v.ordre).map((pa: any) => {
      const r: any = byParam.get(pa.id);
      const f = (r?.drapeau ?? 'N') as Drapeau;
      const val = r?.valeur_num != null ? Number(r.valeur_num).toFixed(pa.decimales) : esc(r?.valeur_texte ?? '—');
      const ref = r?.ref_bas != null || r?.ref_haut != null ? `${r.ref_bas ?? ''} – ${r.ref_haut ?? ''}` : '';
      return `<tr><td>${esc(pa.libelle)}</td><td class="${f === 'N' ? '' : f.length === 2 ? 'crit' : 'anormal'}">${val}</td><td>${esc(pa.unite)}</td><td>${esc(ref)}</td><td>${LIBELLE_DRAPEAU[f]}</td></tr>`;
    }).join('');
    return `<h3 style="margin-top:18px;font-size:11pt;text-transform:uppercase;color:#0e7490">${esc(a.libelle)} <small>(${esc(a.section)})</small></h3><table><thead><tr><th>Paramètre</th><th>Résultat</th><th>Unité</th><th>Valeurs de référence</th><th></th></tr></thead><tbody>${lignes}</tbody></table>`;
  }).join('');
  const definitif = d.statut === 'validee';
  ouvrir(`Compte rendu ${d.numero}`, `${entete(s, `<strong>COMPTE RENDU ${definitif ? 'DÉFINITIF' : 'PARTIEL'}</strong><br><small>Demande ${esc(d.numero)}</small><br><img src="${qr}" alt="QR" width="70" height="70">`)}
<div style="display:flex;justify-content:space-between;margin:14px 0"><div><strong>${esc(p.nom)} ${esc(p.prenoms)}</strong><br><small>Dossier ${esc(p.numero_dossier)} · ${p.sexe === 'F' ? 'Féminin' : 'Masculin'}${p.date_naissance ? ' · né(e) le ' + new Date(p.date_naissance).toLocaleDateString('fr-FR') : ''}</small></div>
<div style="text-align:right"><small>Prescripteur : ${esc(d.prescripteur ?? '—')}<br>Prélevé le : ${d.preleve_le ? new Date(d.preleve_le).toLocaleString('fr-FR') : '—'}<br>Rendu le : ${d.validee_le ? new Date(d.validee_le).toLocaleString('fr-FR') : '—'}</small></div></div>
${blocs}
<div class="sig">${definitif ? `Validé biologiquement le ${new Date(d.validee_le).toLocaleString('fr-FR')}<br>Signature électronique du biologiste` : '<em>Compte rendu non encore validé biologiquement</em>'}</div>${pied(s)}`);
}
