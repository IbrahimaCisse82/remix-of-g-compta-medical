import { Link } from 'react-router-dom';

export default function CguPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg2">
        <Link to="/" className="font-serif text-xl text-primary hover:opacity-80 transition-opacity">G-Compta</Link>
        <span className="text-[10px] text-fg3 font-mono">GROW HUB SARL</span>
      </nav>

      <div className="max-w-3xl mx-auto px-5 py-12">
        <h1 className="font-serif text-3xl text-foreground mb-2">Conditions Générales d'Utilisation</h1>
        <p className="text-xs text-fg3 font-mono mb-8">Dernière mise à jour : 8 mars 2026</p>

        <div className="space-y-8 text-sm text-fg2 leading-relaxed">
          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 1 — Objet</h2>
            <p>Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de l'application G-Compta, éditée par GROW HUB SARL, société de droit sénégalais, dont le siège social est situé à Dakar, Sénégal.</p>
            <p className="mt-2">G-Compta est une application de comptabilité en ligne conforme au référentiel SYSCOHADA révisé, destinée aux entreprises et cabinets d'expertise comptable opérant en zone OHADA.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 2 — Acceptation des conditions</h2>
            <p>L'utilisation de G-Compta implique l'acceptation pleine et entière des présentes CGU. Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser l'application.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 3 — Description du service</h2>
            <p>G-Compta propose les fonctionnalités suivantes :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Saisie d'écritures comptables en partie double</li>
              <li>Génération automatique du Journal, de la Balance et du Grand Livre</li>
              <li>Production des états financiers : Bilan, Compte de Résultat, Tableau des Flux de Trésorerie</li>
              <li>34 Notes Annexes conformes SYSCOHADA</li>
              <li>Liasse Fiscale DSF</li>
              <li>Mode Cabinet multi-clients avec gestion des rôles</li>
              <li>Export PDF et CSV</li>
              <li>Piste d'audit automatique</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 4 — Création de compte</h2>
            <p>L'accès aux fonctionnalités complètes nécessite la création d'un compte utilisateur. L'utilisateur s'engage à fournir des informations exactes et à maintenir la confidentialité de ses identifiants de connexion.</p>
            <p className="mt-2">Un mode démonstration est accessible sans création de compte, en lecture seule.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 5 — Obligations de l'utilisateur</h2>
            <p>L'utilisateur s'engage à :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Utiliser l'application conformément à sa destination comptable</li>
              <li>Ne pas tenter de compromettre la sécurité du système</li>
              <li>Respecter la législation en vigueur, notamment les normes comptables OHADA</li>
              <li>Vérifier l'exactitude des données saisies et des états financiers générés</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 6 — Responsabilité</h2>
            <p>GROW HUB SARL met tout en œuvre pour assurer la fiabilité de G-Compta. Toutefois, l'utilisateur reste seul responsable de la vérification et de la validation des données comptables et des états financiers produits par l'application.</p>
            <p className="mt-2">GROW HUB SARL ne saurait être tenu responsable en cas de perte de données résultant d'un usage non conforme, d'une interruption de service ou d'un cas de force majeure.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 7 — Propriété intellectuelle</h2>
            <p>L'ensemble des éléments composant G-Compta (code source, interface, design, contenus) sont la propriété exclusive de GROW HUB SARL. Toute reproduction, diffusion ou utilisation non autorisée est interdite.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 8 — Résiliation</h2>
            <p>L'utilisateur peut supprimer son compte à tout moment. GROW HUB SARL se réserve le droit de suspendre ou de résilier l'accès en cas de violation des présentes CGU.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 9 — Droit applicable</h2>
            <p>Les présentes CGU sont soumises au droit sénégalais. En cas de litige, les tribunaux de Dakar seront seuls compétents.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-foreground mb-2">Article 10 — Contact</h2>
            <p>Pour toute question relative aux présentes CGU :</p>
            <div className="mt-2 bg-bg2 border border-border rounded-lg p-4">
              <p className="font-semibold text-foreground">GROW HUB SARL</p>
              <p>📍 Dakar, Sénégal</p>
              <p>✉ <a href="mailto:g-compta@growhubsenegal.com" className="text-primary hover:underline">g-compta@growhubsenegal.com</a></p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between">
          <Link to="/" className="text-sm text-primary hover:underline">← Retour à l'accueil</Link>
          <div className="flex gap-4 text-xs text-fg3">
            <Link to="/confidentialite" className="hover:text-primary">Confidentialité</Link>
            <Link to="/protection-donnees" className="hover:text-primary">Protection des données</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
