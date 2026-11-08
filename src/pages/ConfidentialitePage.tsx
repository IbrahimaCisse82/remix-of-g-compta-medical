import { Link } from 'react-router-dom';

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg2">
        <Link to="/" className="font-serif text-xl text-primary hover:opacity-80 transition-opacity">G-Compta</Link>
        <span className="text-[10px] text-fg3 font-mono">GROW HUB SARL</span>
      </nav>

      <div className="max-w-3xl mx-auto px-5 py-12">
        <h1 className="font-serif text-3xl text-foreground mb-2">Politique de Confidentialité</h1>
        <p className="text-xs text-fg3 font-mono mb-8">Dernière mise à jour : 8 mars 2026</p>

        <div className="space-y-8 text-sm text-fg2 leading-relaxed">
          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">1. Responsable du traitement</h2>
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <p className="font-semibold text-foreground">GROW HUB SARL</p>
              <p>Société de droit sénégalais</p>
              <p>📍 Dakar, Sénégal</p>
              <p>✉ <a href="mailto:g-compta@growhubsenegal.com" className="text-primary hover:underline">g-compta@growhubsenegal.com</a></p>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">2. Données collectées</h2>
            <p>Dans le cadre de l'utilisation de G-Compta, nous collectons les catégories de données suivantes :</p>
            <div className="mt-3 space-y-3">
              <div className="bg-bg2 border border-border rounded-lg p-4">
                <h3 className="font-semibold text-foreground text-xs mb-1">Données d'identification</h3>
                <p className="text-xs">Adresse e-mail, nom complet (facultatif), utilisés pour la création et la gestion de votre compte.</p>
              </div>
              <div className="bg-bg2 border border-border rounded-lg p-4">
                <h3 className="font-semibold text-foreground text-xs mb-1">Données comptables</h3>
                <p className="text-xs">Écritures comptables, plan comptable, états financiers, informations sur les entreprises et exercices gérés.</p>
              </div>
              <div className="bg-bg2 border border-border rounded-lg p-4">
                <h3 className="font-semibold text-foreground text-xs mb-1">Données techniques</h3>
                <p className="text-xs">Adresse IP, type de navigateur, données de connexion, utilisées pour la sécurité et l'amélioration du service.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">3. Finalités du traitement</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fourniture et fonctionnement de l'application G-Compta</li>
              <li>Gestion des comptes utilisateurs et authentification</li>
              <li>Stockage sécurisé des données comptables</li>
              <li>Piste d'audit et traçabilité des opérations</li>
              <li>Support technique et amélioration du service</li>
              <li>Communication relative au service (mises à jour, maintenance)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">4. Base légale du traitement</h2>
            <p>Le traitement de vos données est fondé sur :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>L'exécution du contrat :</strong> nécessaire à la fourniture du service</li>
              <li><strong>L'obligation légale :</strong> conformité aux normes comptables OHADA et à la législation sénégalaise</li>
              <li><strong>L'intérêt légitime :</strong> sécurité et amélioration de l'application</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">5. Durée de conservation</h2>
            <p>Les données comptables sont conservées pendant la durée de votre abonnement et pendant une période de <strong>10 ans</strong> après la clôture du compte, conformément aux obligations légales de conservation des documents comptables en zone OHADA (Acte Uniforme relatif au Droit Comptable).</p>
            <p className="mt-2">Les données techniques de connexion sont conservées pendant <strong>12 mois</strong>.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">6. Partage des données</h2>
            <p>Vos données ne sont <strong>jamais vendues</strong> à des tiers. Elles peuvent être partagées uniquement dans les cas suivants :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Avec les membres de votre cabinet comptable (si mode Cabinet activé), selon les rôles attribués</li>
              <li>Avec nos prestataires techniques pour l'hébergement et la maintenance, soumis à des obligations de confidentialité</li>
              <li>Sur requête d'une autorité judiciaire compétente</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">7. Sécurité</h2>
            <p>Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Chiffrement des données en transit (HTTPS/TLS)</li>
              <li>Isolation des données par entreprise (Row-Level Security)</li>
              <li>Authentification sécurisée avec tokens chiffrés</li>
              <li>Piste d'audit automatique de toutes les opérations</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">8. Vos droits</h2>
            <p>Conformément à la loi sénégalaise n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel, vous disposez des droits suivants :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Droit d'accès :</strong> obtenir une copie de vos données personnelles</li>
              <li><strong>Droit de rectification :</strong> corriger vos données inexactes</li>
              <li><strong>Droit de suppression :</strong> demander l'effacement de vos données (sous réserve des obligations légales de conservation)</li>
              <li><strong>Droit d'opposition :</strong> vous opposer au traitement de vos données</li>
              <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré (export CSV/PDF)</li>
            </ul>
            <p className="mt-2">Pour exercer ces droits, contactez-nous à <a href="mailto:g-compta@growhubsenegal.com" className="text-primary hover:underline">g-compta@growhubsenegal.com</a>.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">9. Cookies</h2>
            <p>G-Compta utilise uniquement des cookies essentiels au fonctionnement de l'application (session d'authentification). Aucun cookie de tracking ou publicitaire n'est utilisé.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">10. Modifications</h2>
            <p>Nous nous réservons le droit de modifier cette politique de confidentialité. Les utilisateurs seront informés de toute modification substantielle par notification dans l'application.</p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between">
          <Link to="/" className="text-sm text-primary hover:underline">← Retour à l'accueil</Link>
          <div className="flex gap-4 text-xs text-fg3">
            <Link to="/cgu" className="hover:text-primary">CGU</Link>
            <Link to="/protection-donnees" className="hover:text-primary">Protection des données</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
