import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Section = 'accueil' | 'bilan' | 'resultat' | 'documents' | 'factures' | 'depot';

interface PortailData {
  permissions: {
    bilan: boolean; resultat: boolean; documents: boolean;
    factures: boolean; depot: boolean;
  };
  entreprise: { nom: string; sigle?: string; ninea?: string; rccm?: string; adresse?: string; tel?: string; monnaie?: string } | null;
  exercice: { annee: number; date_debut: string; date_fin: string; statut: string } | null;
  balance?: Array<{ compte: string; intitule: string; sfd: number; sfc: number }>;
  documents?: Array<{ id: string; nom: string; categorie: string; created_at: string; signed_url: string | null; taille_octets: number; source?: string; statut_validation?: string }>;
  factures?: Array<{ id: string; numero: string; date_facture: string; date_echeance: string; statut: string; total_ttc: number; client: { nom: string; ninea?: string } | null }>;
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

export default function PortailPublicPage() {
  const [params] = useSearchParams();
  const entrepriseId = params.get('e') || '';
  const emailQ = params.get('u') || '';
  const jeton = params.get('t') || '';

  const [email, setEmail] = useState(emailQ);
  const [authed, setAuthed] = useState(false);
  const [section, setSection] = useState<Section>('accueil');
  const [data, setData] = useState<PortailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCat, setUploadCat] = useState('Justificatif');
  const fileRef = useRef<HTMLInputElement>(null);

  const invoke = useCallback(async (payload: Record<string, unknown>) => {
    const { data: res, error } = await supabase.functions.invoke('portail-public', {
      body: { entreprise_id: entrepriseId, email, jeton, ...payload },
    });
    if (error || (res && (res as { error?: string }).error)) {
      const msg = (res as { error?: string })?.error || error?.message || 'Accès refusé';
      throw new Error(msg);
    }
    return res as any;
  }, [entrepriseId, email, jeton]);

  const fetchSection = useCallback(async (sec: Section) => {
    if (!entrepriseId || !email) return;
    setLoading(true);
    try {
      const res = await invoke({ section: (sec === 'accueil' || sec === 'depot') ? null : sec });
      setData(res as PortailData);
      setAuthed(true);
    } catch (e: any) {
      toast.error(e.message);
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, [entrepriseId, email, invoke]);

  useEffect(() => {
    if (emailQ && entrepriseId) fetchSection('accueil');
  }, [emailQ, entrepriseId, fetchSection]);

  const connect = async () => {
    if (!email.includes('@')) { toast.error('Email invalide'); return; }
    await fetchSection('accueil');
  };

  const changeSection = (sec: Section) => {
    setSection(sec);
    if (sec === 'bilan' || sec === 'resultat' || sec === 'documents' || sec === 'factures') fetchSection(sec);
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error('Fichier > 20 Mo'); return; }
    setUploading(true);
    try {
      const step1 = await invoke({
        action: 'upload_document_url',
        filename: file.name, mime_type: file.type, size: file.size, categorie: uploadCat,
      });
      // Upload direct au storage via signed URL
      const putRes = await fetch(step1.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload échoué (${putRes.status})`);
      await invoke({
        action: 'finalize_upload',
        path: step1.path, filename: file.name,
        mime_type: file.type, size: file.size, categorie: uploadCat,
      });
      toast.success('Document déposé — votre cabinet a été notifié');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      toast.error(e.message || 'Erreur upload');
    } finally {
      setUploading(false);
    }
  };

  if (!entrepriseId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md bg-bg2 border border-border rounded-xl p-6 text-center">
          <div className="text-2xl mb-2">🌐</div>
          <div className="font-serif text-lg mb-2">Portail Client</div>
          <p className="text-xs text-fg3">Lien invalide. Contactez votre cabinet comptable pour obtenir un lien d'accès.</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-bg2 border border-border rounded-xl p-6">
          <div className="text-2xl text-center mb-2">🔐</div>
          <div className="font-serif text-lg text-center mb-4">Accès Portail Client</div>
          <label className="block text-xs text-fg2 mb-1">Votre email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@societe.com"
            className="w-full bg-bg3 border border-border rounded-md px-3 py-2 text-sm mb-3" />
          <button onClick={connect} disabled={loading}
            className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="text-[10px] text-fg3 mt-3 text-center">Accès réservé — vos autorisations sont définies par votre cabinet.</p>
        </div>
      </div>
    );
  }

  const perms = data?.permissions;
  const tabs: Array<{ id: Section; label: string; icon: string; show: boolean }> = [
    { id: 'accueil', label: 'Accueil', icon: '🏠', show: true },
    { id: 'bilan', label: 'Bilan', icon: '🏛️', show: !!perms?.bilan },
    { id: 'resultat', label: 'Résultat', icon: '📊', show: !!perms?.resultat },
    { id: 'documents', label: 'Documents', icon: '📁', show: !!perms?.documents },
    { id: 'factures', label: 'Factures', icon: '🧾', show: !!perms?.factures },
    { id: 'depot', label: 'Déposer', icon: '⬆️', show: !!perms?.depot },
  ];

  const bilanRows = (data?.balance || []).filter(b => /^[1-5]/.test(b.compte));
  const resultatRows = (data?.balance || []).filter(b => /^[67]/.test(b.compte));
  const totalCharges = resultatRows.filter(r => r.compte.startsWith('6')).reduce((s, r) => s + (r.sfd - r.sfc), 0);
  const totalProduits = resultatRows.filter(r => r.compte.startsWith('7')).reduce((s, r) => s + (r.sfc - r.sfd), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-bg2 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-serif text-lg text-primary">🌐 {data?.entreprise?.nom || 'Portail Client'}</div>
            <div className="text-[10px] text-fg3 font-mono">
              {data?.entreprise?.ninea && `NINEA ${data.entreprise.ninea} · `}
              Exercice {data?.exercice?.annee || '—'} {data?.exercice?.statut === 'cloture' && '🔒'}
            </div>
          </div>
          <div className="text-[10px] text-fg3">
            <div className="font-mono">{email}</div>
            <button onClick={() => setAuthed(false)} className="text-destructive hover:underline">Déconnexion</button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.filter(t => t.show).map(t => (
            <button key={t.id} onClick={() => changeSection(t.id)}
              className={`px-3 py-2 text-xs border-b-2 whitespace-nowrap ${section === t.id ? 'border-primary text-primary font-semibold' : 'border-transparent text-fg2 hover:text-foreground'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {loading && <div className="text-center text-fg3 text-xs py-8">Chargement…</div>}

        {section === 'accueil' && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <div className="text-[10px] text-fg3 uppercase font-mono">Société</div>
              <div className="font-bold text-sm mt-1">{data?.entreprise?.nom}</div>
              <div className="text-[10px] text-fg3">{data?.entreprise?.adresse}</div>
              <div className="text-[10px] text-fg3">{data?.entreprise?.tel}</div>
            </div>
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <div className="text-[10px] text-fg3 uppercase font-mono">Exercice courant</div>
              <div className="font-bold text-sm mt-1">{data?.exercice?.annee}</div>
              <div className="text-[10px] text-fg3">{data?.exercice?.date_debut} → {data?.exercice?.date_fin}</div>
              <div className="text-[10px] mt-1">{data?.exercice?.statut === 'cloture' ? '🔒 Clôturé' : '🟢 En cours'}</div>
            </div>
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <div className="text-[10px] text-fg3 uppercase font-mono">Vos accès</div>
              <ul className="text-[11px] text-fg2 mt-1 space-y-0.5">
                <li>{perms?.bilan ? '✅' : '❌'} Bilan</li>
                <li>{perms?.resultat ? '✅' : '❌'} Compte de résultat</li>
                <li>{perms?.documents ? '✅' : '❌'} Documents</li>
                <li>{perms?.factures ? '✅' : '❌'} Factures</li>
                <li>{perms?.depot ? '✅' : '❌'} Dépôt de documents</li>
              </ul>
            </div>
          </div>
        )}

        {section === 'bilan' && !loading && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-border font-serif text-sm">🏛️ Bilan (comptes patrimoniaux)</div>
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3 text-[10px] uppercase font-mono">
                <tr><th className="p-2 text-left">Compte</th><th className="p-2 text-left">Intitulé</th><th className="p-2 text-right">Solde débit</th><th className="p-2 text-right">Solde crédit</th></tr>
              </thead>
              <tbody>
                {bilanRows.map(r => (
                  <tr key={r.compte} className="border-t border-border">
                    <td className="p-2 font-mono">{r.compte}</td>
                    <td className="p-2">{r.intitule}</td>
                    <td className="p-2 text-right font-mono">{r.sfd > 0 ? fmt(r.sfd) : ''}</td>
                    <td className="p-2 text-right font-mono">{r.sfc > 0 ? fmt(r.sfc) : ''}</td>
                  </tr>
                ))}
                {bilanRows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-fg3">Aucune donnée</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {section === 'resultat' && !loading && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg2 border border-border rounded-lg p-3">
                <div className="text-[10px] text-fg3 uppercase font-mono">Produits (Cl. 7)</div>
                <div className="text-lg font-bold text-accent">{fmt(totalProduits)}</div>
              </div>
              <div className="bg-bg2 border border-border rounded-lg p-3">
                <div className="text-[10px] text-fg3 uppercase font-mono">Charges (Cl. 6)</div>
                <div className="text-lg font-bold text-destructive">{fmt(totalCharges)}</div>
              </div>
              <div className="bg-bg2 border border-border rounded-lg p-3">
                <div className="text-[10px] text-fg3 uppercase font-mono">Résultat</div>
                <div className={`text-lg font-bold ${totalProduits - totalCharges >= 0 ? 'text-accent' : 'text-destructive'}`}>
                  {fmt(totalProduits - totalCharges)}
                </div>
              </div>
            </div>
          </div>
        )}

        {section === 'documents' && !loading && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3 text-[10px] uppercase font-mono">
                <tr><th className="p-2 text-left">Nom</th><th className="p-2 text-left">Catégorie</th><th className="p-2 text-left">Date</th><th className="p-2 text-right">Taille</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {(data?.documents || []).map(d => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="p-2">
                      {d.nom}
                      {d.source === 'portail' && <span className="ml-2 text-[9px] text-fg3">(dépôt)</span>}
                      {d.statut_validation === 'en_attente' && <span className="ml-2 text-[9px] text-primary">⏳</span>}
                    </td>
                    <td className="p-2 text-fg3">{d.categorie}</td>
                    <td className="p-2 font-mono text-fg3">{new Date(d.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="p-2 text-right font-mono text-fg3">{Math.round((d.taille_octets || 0) / 1024)} Ko</td>
                    <td className="p-2 text-right">
                      {d.signed_url && <a href={d.signed_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">⬇ Télécharger</a>}
                    </td>
                  </tr>
                ))}
                {(!data?.documents || data.documents.length === 0) && <tr><td colSpan={5} className="p-6 text-center text-fg3">Aucun document</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {section === 'factures' && !loading && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3 text-[10px] uppercase font-mono">
                <tr><th className="p-2 text-left">N°</th><th className="p-2 text-left">Client</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Échéance</th><th className="p-2 text-left">Statut</th><th className="p-2 text-right">Total TTC</th></tr>
              </thead>
              <tbody>
                {(data?.factures || []).map(f => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="p-2 font-mono">{f.numero}</td>
                    <td className="p-2">{f.client?.nom || '—'}</td>
                    <td className="p-2 font-mono text-fg3">{f.date_facture}</td>
                    <td className="p-2 font-mono text-fg3">{f.date_echeance}</td>
                    <td className="p-2"><span className="px-2 py-0.5 rounded text-[10px] bg-bg3 border border-border">{f.statut}</span></td>
                    <td className="p-2 text-right font-mono">{fmt(Number(f.total_ttc))}</td>
                  </tr>
                ))}
                {(!data?.factures || data.factures.length === 0) && <tr><td colSpan={6} className="p-6 text-center text-fg3">Aucune facture</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {section === 'depot' && !loading && (
          <div className="max-w-xl bg-bg2 border border-border rounded-lg p-5">
            <div className="font-serif text-base mb-1">⬆️ Déposer un document</div>
            <p className="text-[11px] text-fg3 mb-4">
              Vos justificatifs (factures, RIB, contrats…) sont transmis directement à votre cabinet
              qui recevra une notification. Formats acceptés : PDF, images, Office. Taille max : 20 Mo.
            </p>
            <label className="block text-[11px] text-fg2 mb-1">Catégorie</label>
            <select value={uploadCat} onChange={e => setUploadCat(e.target.value)}
              className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-xs mb-3">
              <option>Justificatif</option>
              <option>Facture d'achat</option>
              <option>Facture de vente</option>
              <option>Relevé bancaire</option>
              <option>Contrat</option>
              <option>Fiche de paie</option>
              <option>Autre</option>
            </select>
            <label className="block text-[11px] text-fg2 mb-1">Fichier</label>
            <input ref={fileRef} type="file" disabled={uploading}
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
              className="w-full text-xs bg-bg3 border border-border rounded px-2 py-1.5" />
            {uploading && <div className="text-[11px] text-primary mt-3">⏳ Envoi en cours…</div>}
          </div>
        )}

        <footer className="text-[10px] text-fg3 text-center mt-8 py-4 border-t border-border">
          🔐 Portail sécurisé · Données protégées · Généré par G-Compta
        </footer>
      </main>
    </div>
  );
}
