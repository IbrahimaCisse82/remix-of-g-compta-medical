import { Link } from 'react-router-dom';

export default function ProtectionDonneesPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg2">
        <Link to="/" className="font-serif text-xl text-primary hover:opacity-80 transition-opacity">G-Compta</Link>
        <span className="text-[10px] text-fg3 font-mono">GROW HUB SARL</span>
      </nav>

      <div className="max-w-3xl mx-auto px-5 py-12">
        <h1 className="font-serif text-3xl text-foreground mb-2">Protection des Données Personnelles</h1>
        <p className="text-xs text-fg3 font-mono mb-8">Dernière mise à jour : 8 mars 2026</p>

        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-8">
          <p className="text-sm text-foreground leading-relaxed">
            GROW HUB SARL s'engage à protéger les données personnelles de ses utilisateurs conformément à la 
            <strong> loi sénégalaise n° 2008-12 du 25 janvier 2008</strong> relative à la protection des données à caractère personnel 
            et au <strong>Règlement n° 01/2023/CM/UEMOA</strong> relatif à la protection des données à caractère personnel dans l'espace UEMOA.
          </p>
        </div>

        <div className="space-y-8 text-sm text-fg2 leading-relaxed">
          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">1. Cadre juridique</h2>
            <p>La protection des données au sein de G-Compta est régie par :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>La <strong>loi n° 2008-12 du 25 janvier 2008</strong> sur la protection des données à caractère personnel (Sénégal)</li>
              <li>Le <strong>décret n° 2008-721 du 30 juin 2008</strong> portant application de ladite loi</li>
              <li>Le <strong>Règlement n° 01/2023/CM/UEMOA</strong> relatif à la protection des données personnelles</li>
              <li>L'<strong>Acte Uniforme OHADA</strong> relatif au Droit Comptable et à l'Information Financière</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">2. Autorité de contrôle</h2>
            <p>L'autorité compétente en matière de protection des données au Sénégal est la <strong>Commission de Protection des Données Personnelles (CDP)</strong>.</p>
            <div className="mt-2 bg-bg2 border border-border rounded-lg p-4">
              <p className="font-semibold text-foreground text-xs">Commission de Protection des Données Personnelles</p>
              <p className="text-xs">📍 Dakar, Sénégal</p>
              <p className="text-xs">🌐 <a href="https://www.cdp.sn" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.cdp.sn</a></p>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">3. Principes de protection appliqués</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {[
                { icon: '🎯', title: 'Finalité', desc: 'Les données sont collectées pour des finalités déterminées, explicites et légitimes.' },
                { icon: '📏', title: 'Proportionnalité', desc: 'Seules les données strictement nécessaires au service sont collectées.' },
                { icon: '⏱️', title: 'Limitation de durée', desc: 'Les données sont conservées pour la durée nécessaire aux finalités du traitement.' },
                { icon: '🔒', title: 'Sécurité', desc: 'Des mesures techniques et organisationnelles appropriées sont mises en œuvre.' },
                { icon: '📢', title: 'Transparence', desc: 'Les utilisateurs sont informés de manière claire et accessible.' },
                { icon: '✅', title: 'Consentement', desc: 'Le traitement repose sur des bases légales clairement identifiées.' },
              ].map(p => (
                <div key={p.title} className="bg-bg2 border border-border rounded-lg p-4">
                  <div className="text-lg mb-1">{p.icon}</div>
                  <h3 className="font-semibold text-foreground text-xs mb-1">{p.title}</h3>
                  <p className="text-[11px] text-fg3">{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">4. Mesures de sécurité techniques</h2>
            <div className="space-y-3 mt-3">
              <div className="flex gap-3 items-start">
                <span className="text-primary font-mono text-sm mt-0.5">01</span>
                <div>
                  <h3 className="font-semibold text-foreground text-xs">Chiffrement des communications</h3>
                  <p className="text-xs text-fg3">Toutes les communications entre votre navigateur et nos serveurs sont chiffrées via HTTPS/TLS.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-primary font-mono text-sm mt-0.5">02</span>
                <div>
                  <h3 className="font-semibold text-foreground text-xs">Isolation des données (Row-Level Security)</h3>
                  <p className="text-xs text-fg3">Chaque entreprise dispose d'un espace de données isolé. Un utilisateur ne peut accéder qu'aux données des entreprises auxquelles il est autorisé.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-primary font-mono text-sm mt-0.5">03</span>
                <div>
                  <h3 className="font-semibold text-foreground text-xs">Authentification sécurisée</h3>
                  <p className="text-xs text-fg3">Les mots de passe sont hachés avec des algorithmes cryptographiques robustes. Les sessions sont gérées par tokens JWT avec expiration automatique.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-primary font-mono text-sm mt-0.5">04</span>
                <div>
                  <h3 className="font-semibold text-foreground text-xs">Piste d'audit</h3>
                  <p className="text-xs text-fg3">Toutes les opérations comptables (création, modification, suppression) sont automatiquement enregistrées dans une piste d'audit non modifiable.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-primary font-mono text-sm mt-0.5">05</span>
                <div>
                  <h3 className="font-semibold text-foreground text-xs">Contrôle d'accès par rôle (RBAC)</h3>
                  <p className="text-xs text-fg3">En mode Cabinet, les accès sont contrôlés par rôle (Administrateur, Comptable, Lecteur) avec des permissions granulaires.</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">5. Transfert de données</h2>
            <p>Les données sont hébergées sur des serveurs sécurisés. En cas de transfert hors du territoire sénégalais, GROW HUB SARL s'assure que le pays destinataire offre un niveau de protection adéquat conformément à l'article 49 de la loi n° 2008-12.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">6. Droits des personnes concernées</h2>
            <p>Conformément à la législation en vigueur, vous disposez des droits suivants :</p>
            <table className="w-full mt-3 border border-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-bg3">
                  <th className="text-left text-[10px] font-bold text-fg3 uppercase px-3 py-2 border-b border-border">Droit</th>
                  <th className="text-left text-[10px] font-bold text-fg3 uppercase px-3 py-2 border-b border-border">Description</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                <tr className="border-b border-border/50">
                  <td className="px-3 py-2 font-semibold text-foreground">Accès</td>
                  <td className="px-3 py-2">Obtenir confirmation du traitement et une copie de vos données</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-3 py-2 font-semibold text-foreground">Rectification</td>
                  <td className="px-3 py-2">Faire corriger des données inexactes ou incomplètes</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-3 py-2 font-semibold text-foreground">Suppression</td>
                  <td className="px-3 py-2">Demander l'effacement (sous réserve des obligations légales)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-3 py-2 font-semibold text-foreground">Opposition</td>
                  <td className="px-3 py-2">Vous opposer au traitement pour motif légitime</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold text-foreground">Portabilité</td>
                  <td className="px-3 py-2">Récupérer vos données via export CSV/PDF</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">7. Notification des violations</h2>
            <p>En cas de violation de données personnelles susceptible d'engendrer un risque pour les droits et libertés des personnes, GROW HUB SARL s'engage à :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Notifier la CDP dans les <strong>72 heures</strong> suivant la découverte de la violation</li>
              <li>Informer les personnes concernées dans les meilleurs délais si le risque est élevé</li>
              <li>Documenter toute violation dans un registre interne</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">8. Contact du Délégué à la Protection des Données</h2>
            <p>Pour toute question relative à la protection de vos données :</p>
            <div className="mt-2 bg-bg2 border border-border rounded-lg p-4">
              <p className="font-semibold text-foreground">GROW HUB SARL — DPO</p>
              <p>📍 Dakar, Sénégal</p>
              <p>✉ <a href="mailto:g-compta@growhubsenegal.com" className="text-primary hover:underline">g-compta@growhubsenegal.com</a></p>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">9. Réclamation</h2>
            <p>Si vous estimez que le traitement de vos données n'est pas conforme, vous pouvez introduire une réclamation auprès de la <strong>Commission de Protection des Données Personnelles (CDP)</strong> du Sénégal.</p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between">
          <Link to="/" className="text-sm text-primary hover:underline">← Retour à l'accueil</Link>
          <div className="flex gap-4 text-xs text-fg3">
            <Link to="/cgu" className="hover:text-primary">CGU</Link>
            <Link to="/confidentialite" className="hover:text-primary">Confidentialité</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
