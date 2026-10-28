// This dataset is deliberately non-clinical and restricted to the dedicated demo identity.
export const DEMO_EMAIL = 'demo-sante@gcompta.sn';
export const DEMO_NAME = 'PME 1';
export const PREFIX = 'DEMO-PME1-';

export async function populateDemo(db: any) {
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || auth?.user?.email !== DEMO_EMAIL) throw new Error('Dedicated demo account required');
  const uid = auth.user.id;
  const checked = async (request: any) => {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  };
  const members = await checked(db.from('structure_memberships').select('id,structure_id').eq('user_id', uid).eq('statut', 'actif'));
  if (members.length !== 1) throw new Error('Ambiguous demo membership');
  const sid = members[0].structure_id;
  const st = await checked(db.from('structures').select('id,nom,created_by,entreprise_id,type').eq('id', sid).single());
  if (st.created_by !== uid || st.type !== 'mixte' || st.nom !== DEMO_NAME) throw new Error('Not the PME 1 demo structure');
  const ent = await checked(db.from('entreprises').select('user_id,secteur_activite,nom').eq('id', st.entreprise_id).single());
  if (ent.user_id !== uid || ent.secteur_activite !== 'sante_mixte' || ent.nom !== DEMO_NAME) throw new Error('Not the demo company');
  // Read-before-create keeps retries safe without overwriting any previous activity.
  const once = async (table: string, fields: Record<string, unknown>, values: Record<string, unknown>) => {
    let q = db.from(table).select('*').eq('structure_id', sid);
    for (const [key, value] of Object.entries(fields)) q = q.eq(key, value);
    const rows = await checked(q);
    if (rows.length > 1) throw new Error('Ambiguous demo record');
    return rows[0] || await checked(db.from(table).insert({ ...values, ...fields, structure_id: sid }).select('*').single());
  };
  const rpc = (name: string, args: Record<string, unknown>) => checked(db.rpc(name, args));
  const practitioner = await once('sante_praticiens', { nom: 'Dr Démonstration — fictif' }, { user_id: uid, specialite: 'Médecine générale (démo)' });
  const acts = [['CONS', 'Consultation générale', 10000], ['SUIVI', 'Consultation de suivi', 5000], ['SOINS', 'Soins infirmiers', 3000], ['CERT', 'Certificat médical', 2000]];
  for (const [code, label, price] of acts) await once('sante_actes', { code: PREFIX + code }, { libelle: `${label} — tarif fictif`, tarif: price, regime_tva: 'exonere', taux_tva: 0 });
  const analysisRows = [];
  const analyses = [['NFS','Numération formule sanguine','hematologie','EDTA',6000], ['GLY','Glycémie','biochimie','Fluorure',2500], ['CREAT','Créatinine','biochimie','Sec',3500], ['CRP','Protéine C réactive','biochimie','Sec',5000], ['ECBU','Examen cytobactériologique des urines','urines','Flacon',7000], ['GE','Goutte épaisse','parasitologie','EDTA',3000]];
  for (const [code, label, section, tube, price] of analyses) {
    const a = await once('sante_analyses', { code: PREFIX + code }, { libelle: `${label} — démo`, section, tube, echantillon: 'Échantillon fictif', tarif: price, regime_tva: 'exonere', taux_tva: 0 });
    const param = await once('sante_analyse_parametres', { analyse_id: a.id, code: 'DEMO' }, { libelle: 'Observation fictive — sans valeur clinique', type: 'texte' });
    analysisRows.push({ ...a, param });
  }
  const patients = [];
  for (let i = 1; i <= 12; i++) {
    const prenoms = `Patient fictif ${String(i).padStart(2, '0')}`;
    const rows = await checked(db.from('sante_patients').select('*').eq('structure_id', sid).eq('nom', 'DÉMONSTRATION').eq('prenoms', prenoms));
    if (rows.length > 1) throw new Error('Duplicate demo patient');
    const pid = rows[0]?.id || await rpc('sante_creer_patient', { _structure_id: sid, _nom: 'DÉMONSTRATION', _prenoms: prenoms, _sexe: i % 2 ? 'F' : 'M', _date_naissance: `${1975 + i * 3}-05-15`, _consentement: true });
    patients.push(pid);
  }
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 6; i++) {
    const motif = `${PREFIX}CONS-${i + 1} — consultation fictive sans diagnostic médical`;
    const existing = await checked(db.from('sante_consultations').select('id').eq('structure_id', sid).eq('motif', motif));
    const cid = existing[0]?.id || await rpc('sante_demarrer_consultation', { _patient_id: patients[i], _praticien_id: practitioner.id, _motif: motif });
    const invoices = await checked(db.from('sante_factures').select('id').eq('structure_id', sid).eq('consultation_id', cid));
    if (!invoices.length) await rpc('sante_creer_facture', { _patient_id: patients[i], _consultation_id: cid, _lignes: [{ libelle: 'Consultation de démonstration — tarif fictif', prix_unitaire: 10000, regime_tva: 'exonere', taux_tva: 0, categorie: 'consultation' }] });
    if (i < 3) {
      const bills = await checked(db.from('sante_factures').select('id,part_patient').eq('structure_id', sid).eq('consultation_id', cid));
      const payments = await checked(db.from('sante_encaissements').select('id').eq('structure_id', sid).eq('facture_id', bills[0].id));
      if (!payments.length) {
        const sessions = await checked(db.from('sante_sessions_caisse').select('id').eq('structure_id', sid).eq('caissier', uid).is('fermee_le', null));
        const session = sessions[0]?.id || await rpc('sante_ouvrir_caisse', { _structure_id: sid, _fond: 0 });
        await rpc('sante_encaisser', { _facture_id: bills[0].id, _mode: 'especes', _montant: bills[0].part_patient, _reference: PREFIX + `PAY-${i + 1}` });
        // A newly opened demo session is closed without touching another session.
        if (!sessions.length) await rpc('sante_fermer_caisse', { _session_id: session, _compte: bills[0].part_patient });
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const marker = PREFIX + `LAB-${i + 1}`;
    const requests = await checked(db.from('sante_demandes_labo').select('id').eq('structure_id', sid).eq('renseignements', marker));
    if (!requests.length) await rpc('sante_creer_demande_labo', { _patient_id: patients[i], _analyses: [analysisRows[i].id], _prescripteur: practitioner.nom, _renseignements: marker });
  }
  for (let i = 0; i < 6; i++) await once('sante_rendez_vous', { motif: PREFIX + `RDV-${i + 1}` }, { patient_id: patients[i + 6], praticien_id: practitioner.id, debut: `${today}T${String(9 + i).padStart(2, '0')}:00:00Z`, duree_min: 20 });
  for (const [i, name] of ['Réactif biochimie', 'Réactif hématologie', 'Bandelettes urinaires'].entries()) {
    const reactif = await once('sante_reactifs', { nom: `${name} — fictif PME 1` }, { seuil_alerte: 20, unite: 'test' });
    const lot = PREFIX + `LOT-${i + 1}`;
    const lots = await checked(db.from('sante_lots_reactifs').select('id').eq('structure_id', sid).eq('reactif_id', reactif.id).eq('numero_lot', lot));
    if (!lots.length) await rpc('sante_mouvement_reactif', { _reactif_id: reactif.id, _type: 'reception', _quantite: [100, 50, 10][i], _numero_lot: lot, _peremption: '2027-12-31' });
  }
  for (const [i, type] of ['poste', 'garde', 'formation'].entries()) await once('sante_plannings', { note: PREFIX + `PLAN-${i + 1}` }, { membership_id: members[0].id, type, debut: `${today}T${String(8 + i * 4).padStart(2, '0')}:00:00Z`, fin: `${today}T${String(11 + i * 4).padStart(2, '0')}:00:00Z` });
  await once('sante_organismes', { nom: 'IPM Démonstration — organisme fictif' }, { type: 'ipm' });
  await once('sante_retrocession_regles', { praticien_id: practitioner.id, categorie: 'consultation' }, { taux: 30 });
  return { structure_id: sid, patients: 12, actes: 4, analyses: 6, consultations: 6, factures: 6, encaissements: 3, demandes: 4, rendez_vous: 6, lots: 3, plannings: 3 };
}