import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Ouvre l'ordonnance au format A4 (en-tête légal + n° d'ordre du praticien) et lance l'impression. */
export async function imprimerOrdonnance(ordonnanceId: string) {
  const { data: o } = await supabase.from('sante_ordonnances')
    .select('*, lignes:sante_ordonnance_lignes(*), patient:sante_patients(nom, prenoms, date_naissance, sexe, numero_dossier), praticien:sante_praticiens(nom, specialite, numero_ordre), structure:structures(nom, adresse, telephone, ninea, rccm, autorisation_exercice)')
    .eq('id', ordonnanceId).maybeSingle();
  if (!o) return toast.error('Ordonnance introuvable');
  const s = o.structure, p = o.patient, pr = o.praticien;
  const lignes = [...o.lignes].sort((a, b) => a.ordre - b.ordre);
  const w = window.open('', '_blank');
  if (!w) return toast.error('Autorisez les fenêtres pour imprimer');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ordonnance ${esc(o.numero)}</title>
<style>@page{size:A4;margin:16mm}body{font-family:Georgia,serif;color:#111;font-size:12pt}header{display:flex;justify-content:space-between;border-bottom:2px solid #0e7490;padding-bottom:8px}
h1{font-size:16pt;margin:0;color:#0e7490}small{color:#444}.pat{margin:18px 0;display:flex;justify-content:space-between}ol{line-height:1.6}li{margin-bottom:10px}
.sig{margin-top:60px;text-align:right}footer{position:fixed;bottom:0;left:0;right:0;font-size:8pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:4px}</style></head><body>
<header><div><h1>${esc(s.nom)}</h1><small>${esc(s.adresse)}<br>Tél. ${esc(s.telephone)}</small></div>
<div style="text-align:right"><strong>${esc(pr.nom)}</strong><br><small>${esc(pr.specialite)}<br>N° Ordre : ${esc(pr.numero_ordre)}</small></div></header>
<div class="pat"><div><strong>${esc(p.nom)} ${esc(p.prenoms)}</strong><br><small>Dossier ${esc(p.numero_dossier)}${p.date_naissance ? ' · né(e) le ' + new Date(p.date_naissance).toLocaleDateString('fr-FR') : ''}</small></div>
<div style="text-align:right"><strong>ORDONNANCE ${esc(o.numero)}</strong><br><small>Dakar, le ${new Date(o.emise_le).toLocaleDateString('fr-FR')}</small></div></div>
<ol>${lignes.map(l => `<li><strong>${esc(l.medicament)}</strong>${l.quantite ? ' — Qté : ' + esc(l.quantite) : ''}<br>${esc(l.posologie)}${l.duree ? ' pendant ' + esc(l.duree) : ''}</li>`).join('')}</ol>
${o.recommandations ? `<p><em>${esc(o.recommandations)}</em></p>` : ''}
<div class="sig">Signature et cachet<br><br><strong>${esc(pr.nom)}</strong></div>
<footer>NINEA ${esc(s.ninea)} · RCCM ${esc(s.rccm)}${s.autorisation_exercice ? ' · Autorisation ' + esc(s.autorisation_exercice) : ''} · Document émis électroniquement, non modifiable</footer>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
