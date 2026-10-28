import { describe, expect, it, vi } from 'vitest';
import { saveBeforeClosing } from './consultation-workflow';
describe('Clôture sans perte de contenu clinique', () => {
  it('ne clôture jamais si l’enregistrement échoue', async () => {
    const confirm = vi.fn(() => true), close = vi.fn();
    await saveBeforeClosing(async () => false, confirm, close);
    expect(confirm).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
  it('respecte le refus de confirmation après enregistrement', async () => {
    const close = vi.fn();
    await saveBeforeClosing(async () => true, () => false, close);
    expect(close).not.toHaveBeenCalled();
  });
  it('enregistre avant de clôturer', async () => {
    const steps: string[] = [];
    await saveBeforeClosing(async () => { steps.push('saved'); return true; }, () => true, async () => { steps.push('closed'); });
    expect(steps).toEqual(['saved', 'closed']);
  });
});