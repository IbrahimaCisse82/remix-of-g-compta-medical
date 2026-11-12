import { describe, expect, it, vi } from 'vitest';
import { aIgnorer, definirContexteErreurs, installerSignalementErreurs, nettoyer } from './signalement-erreurs';

describe('nettoyage des erreurs', () => {
  it('retire e-mails, numéros longs et jetons', () => {
    const t = nettoyer('échec pour awa.diop@exemple.sn tel +221 77 123 45 67 jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc', 500);
    expect(t).not.toMatch(/awa|77 123|eyJ/);
    expect(t).toContain('[e-mail]'); expect(t).toContain('[nombre]'); expect(t).toContain('[jeton]');
  });
  it('garde les numéros de ligne et coupe à la longueur demandée', () => {
    expect(nettoyer('at x (app.js:1234:56)', 500)).toBe('at x (app.js:1234:56)');
    expect(nettoyer('z'.repeat(900), 500)).toHaveLength(500);
  });
  it('ignore le bruit des navigateurs', () => {
    expect(aIgnorer('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(aIgnorer('Cannot read properties of undefined')).toBe(false);
  });
});

describe('signalement', () => {
  it('envoie une fois par message, avec la page et la structure, et s’arrête au maximum', async () => {
    const envoyer = vi.fn().mockResolvedValue(null);
    definirContexteErreurs({ structureId: 's1', page: 'sante_agenda' });
    const retirer = installerSignalementErreurs(envoyer, 2);
    window.dispatchEvent(new ErrorEvent('error', { message: 'Boum', error: new Error('Boum') }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Boum' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Autre' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Troisième' }));
    retirer();
    expect(envoyer).toHaveBeenCalledTimes(2);
    expect(envoyer.mock.calls[0][0]).toMatchObject({ _message: 'Boum', _page: 'sante_agenda', _structure_id: 's1' });
  });
});
