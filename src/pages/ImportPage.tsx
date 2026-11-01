import { useState, useRef } from 'react';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { enregistrerLignesJournal } from '@/lib/ecritures';
import ImportBalance from '@/components/ImportBalance';

interface ImportLine {
  date_ecriture: string;
  piece: string;
  journal_code: string;
  compte: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
}

function parseCSV(text: string, separator = ';'): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === separator && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  });
}

function parseNumber(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0;
}

function detectColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  
  const patterns: [string, RegExp[]][] = [
    ['date', [/date/, /echeance/]],
    ['piece', [/piece/, /numero/, /ref/]],
    ['journal', [/journal/, /jrnl/, /code.*journal/]],
    ['compte', [/compte/, /numero.*compte/, /n[°o].*cpt/]],
    ['intitule', [/intitule/, /nom.*compte/, /libelle.*compte/]],
    ['libelle', [/libelle/, /description/, /designation/]],
    ['debit', [/debit/, /montant.*debit/]],
    ['credit', [/credit/, /montant.*credit/]],
  ];

  for (const [key, regexes] of patterns) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (regexes.some(r => r.test(lowerHeaders[i])) && !(key in map)) {
        map[key] = i;
        break;
      }
    }
  }
  return map;
}

export default function ImportPage() {
  const { entreprise, exercice } = useApp();
  const { canWrite } = useUserRole();
  const [preview, setPreview] = useState<ImportLine[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const text = await file.text();
    const separator = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
    const rows = parseCSV(text, separator);
    
    if (rows.length < 2) {
      toast.error('Fichier vide ou format non reconnu');
      return;
    }

    const headers = rows[0];
    const colMap = detectColumns(headers);

    if (!('compte' in colMap) || !('debit' in colMap && 'credit' in colMap)) {
      toast.error('Colonnes requises non trouvées: Compte, Débit, Crédit');
      return;
    }

    const lines: ImportLine[] = rows.slice(1).map(row => ({
      date_ecriture: row[colMap.date] || exercice?.date_debut || '',
      piece: row[colMap.piece] || 'IMP',
      journal_code: row[colMap.journal] || 'OD',
      compte: row[colMap.compte] || '',
      intitule: row[colMap.intitule] || '',
      libelle: row[colMap.libelle] || 'Import',
      debit: parseNumber(row[colMap.debit] || '0'),
      credit: parseNumber(row[colMap.credit] || '0'),
    })).filter(l => l.compte && (l.debit > 0 || l.credit > 0));

    setPreview(lines);
    toast.success(`${lines.length} lignes détectées`);
  };

  const handleImport = async () => {
    if (!entreprise || !exercice || preview.length === 0) return;
    setImporting(true);

    const entries = preview.map(l => ({
      ...l,
      entreprise_id: entreprise.id,
      exercice_id: exercice.id,
    }));

    let imported = 0;
    try {
      const ids = await enregistrerLignesJournal(entries as any, { origine: 'import' });
      imported = entries.length;
      if (ids.length === 0) { toast.error('Aucune écriture créée'); setImporting(false); return; }
    } catch (e) {
      toast.error(`Import refusé : ${(e as Error).message}`);
      setImporting(false);
      return;
    }

    toast.success(`${imported} écritures importées avec succès !`);
    setPreview([]);
    setFileName('');
    setImporting(false);
  };

  if (!canWrite) {
    return (
      <div className="p-10 text-center text-fg3">
        <p className="text-lg">🔒 Accès restreint</p>
        <p className="text-sm mt-2">Seuls les comptables et administrateurs peuvent importer des écritures.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Import balance / FEC / CSV</div>
          <div className="text-[10px] text-fg3 font-mono">Fichier des Écritures Comptables — {entreprise?.nom}</div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <ImportBalance />
        <div className="bg-bg2 border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-primary">📂 Importer un fichier comptable</h3>
          <p className="text-[11px] text-fg2">
            Formats supportés : <strong>FEC</strong> (Fichier des Écritures Comptables), <strong>CSV</strong>, <strong>TSV</strong>. 
            Les colonnes sont détectées automatiquement.
          </p>
          <div className="bg-bg3 rounded-lg p-3 border border-border/50">
            <p className="text-[10px] text-fg3 font-mono mb-2">Colonnes attendues :</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px]">
              {['Date', 'Pièce', 'Journal', 'Compte', 'Intitulé', 'Libellé', 'Débit', 'Crédit'].map(c => (
                <span key={c} className="bg-bg2 rounded px-2 py-1 border border-border/30 font-mono">{c}</span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.fec"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              📁 Sélectionner un fichier
            </button>
            {fileName && <span className="text-[11px] text-fg2 font-mono">{fileName}</span>}
          </div>
        </div>

        {preview.length > 0 && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold">Aperçu — {preview.length} lignes</span>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-1.5 rounded-md text-[11px] font-bold bg-success text-success-foreground hover:bg-success/90 disabled:opacity-50"
              >
                {importing ? '⏳ Import en cours...' : `✅ Importer ${preview.length} écritures`}
              </button>
            </div>
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-bg3">
                    <th className="px-2 py-1 text-left border-b border-border">Date</th>
                    <th className="px-2 py-1 text-left border-b border-border">Pièce</th>
                    <th className="px-2 py-1 text-left border-b border-border">Jnl</th>
                    <th className="px-2 py-1 text-left border-b border-border">Compte</th>
                    <th className="px-2 py-1 text-left border-b border-border">Intitulé</th>
                    <th className="px-2 py-1 text-left border-b border-border">Libellé</th>
                    <th className="px-2 py-1 text-right border-b border-border">Débit</th>
                    <th className="px-2 py-1 text-right border-b border-border">Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 100).map((l, i) => (
                    <tr key={i} className="hover:bg-bg3/50">
                      <td className="px-2 py-1 border-b border-border/30 font-mono">{l.date_ecriture}</td>
                      <td className="px-2 py-1 border-b border-border/30">{l.piece}</td>
                      <td className="px-2 py-1 border-b border-border/30">{l.journal_code}</td>
                      <td className="px-2 py-1 border-b border-border/30 font-mono font-bold">{l.compte}</td>
                      <td className="px-2 py-1 border-b border-border/30">{l.intitule}</td>
                      <td className="px-2 py-1 border-b border-border/30">{l.libelle}</td>
                      <td className="px-2 py-1 border-b border-border/30 text-right font-mono text-success">{l.debit > 0 ? l.debit.toLocaleString('fr-FR') : ''}</td>
                      <td className="px-2 py-1 border-b border-border/30 text-right font-mono text-destructive">{l.credit > 0 ? l.credit.toLocaleString('fr-FR') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 100 && (
                <div className="px-3 py-2 text-center text-[10px] text-fg3">... et {preview.length - 100} lignes supplémentaires</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
