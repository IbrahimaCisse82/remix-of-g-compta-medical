import { describe, expect, it } from 'vitest';
import { candidatsReglement, classerDebiteurs, lireReleveReglements, totauxBalance, validerRapprochements } from './reglements-import';
const f = [{id:'a',numero:'FAC-1',organisme:'IPM Démo',reste:8000},{id:'b',numero:'FAC-2',organisme:'IPM Démo',reste:8000},{id:'c',numero:'FAC-3',organisme:'Autre',reste:8000}];
const l = {date:'2026-10-28',reference:'VIR-1',organisme:'IPM Démo',facture:'FAC-1',montant:3000,mode:'virement'};
describe('Rapprochement des règlements', () => {
 it('importe un règlement partiel entier sans écrire de données', () => { expect(lireReleveReglements('date;reference;organisme;facture;montant\n2026-10-28;VIR-1;IPM Démo;FAC-1;3 000','2026-10-28')).toEqual([l]); });
 it('refuse fractions, négatifs, dates impossibles et futures', () => { for (const row of ['2026-10-28;1.5','2026-10-28;-1','2026-02-30;3000','2026-10-29;3000']) { const [d,m]=row.split(';'); expect(() => lireReleveReglements(`date;reference;organisme;montant\n${d};VIR;IPM;${m}`,'2026-10-28')).toThrow(); } });
 it('détecte les lignes répétées', () => { expect(() => lireReleveReglements('date;reference;organisme;montant\n2026-10-28;VIR;IPM;3000\n2026-10-28;VIR;IPM;3000','2026-10-28')).toThrow('répété'); });
 it('propose la référence exacte pour un paiement partiel', () => { expect(candidatsReglement(l,f).map(x=>x.id)).toEqual(['a']); });
 it('ne choisit pas entre deux factures de même montant', () => { expect(candidatsReglement({...l,facture:'',montant:8000},f)).toHaveLength(2); });
 it('ne propose pas un autre organisme ni une référence inconnue', () => { expect(candidatsReglement({...l,facture:'FAC-3'},f)).toEqual([]); });
 it('exige la confirmation explicite', () => { expect(()=>validerRapprochements([l],['a'],[false],f)).toThrow(); });
 it('valide 3 000 sur une facture de 8 000', () => { expect(validerRapprochements([l],['a'],[true],f)[0]).toMatchObject({facture_id:'a',montant:3000,confirme:true}); });
 it('refuse le cumul de plusieurs lignes supérieur au solde', () => { expect(()=>validerRapprochements([l,{...l,reference:'VIR-2',montant:6000}],['a','a'],[true,true],f)).toThrow('cumul'); });
});
describe('Balance âgée et débiteurs', () => {
 const rows=[{organisme:'B',j0_30:100,j31_60:200,j61_90:300,plus_90:400,total:1000},{organisme:'A',j0_30:2000,j31_60:null,j61_90:null,plus_90:null,total:2000}];
 it('classe par montant dû décroissant sans modifier les données source',()=>{expect(classerDebiteurs(rows).map(r=>r.organisme)).toEqual(['A','B']);expect(rows[0].organisme).toBe('B');});
 it('totalise séparément les quatre tranches',()=>{expect(totauxBalance(rows)).toEqual({j0_30:2100,j31_60:200,j61_90:300,plus_90:400,total:3000});});
});