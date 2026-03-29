import { describe, it, expect } from 'vitest';
import { normaliseTitle } from './string';

describe('normaliseTitle', () => {
  it('returns the title unchanged when no noise is present', () => {
    expect(normaliseTitle('Solomun - Boiler Room')).toBe('Solomun - Boiler Room');
  });

  it('removes (Official Video)', () => {
    expect(normaliseTitle('Amelie Lens - Live (Official Video)')).toBe('Amelie Lens - Live');
  });

  it('removes (Official DJ Set)', () => {
    expect(normaliseTitle('Charlotte de Witte (Official DJ Set)')).toBe('Charlotte de Witte');
  });

  it('removes [Full Set]', () => {
    expect(normaliseTitle('Richie Hawtin [Full Set] Awakenings 2024')).toBe(
      'Richie Hawtin Awakenings 2024',
    );
  });

  it('removes HD', () => {
    expect(normaliseTitle('Ben Klock - Berghain HD')).toBe('Ben Klock - Berghain');
  });

  it('removes 4K', () => {
    expect(normaliseTitle('Maceo Plex 4K Live')).toBe('Maceo Plex Live');
  });

  it('removes hashtags', () => {
    expect(normaliseTitle('Fisher - Live #techno #festival')).toBe('Fisher - Live');
  });

  it('removes | Channel suffix', () => {
    expect(normaliseTitle('Nina Kraviz - DJ Set | Live From Earth')).toBe('Nina Kraviz - DJ Set');
  });

  it('collapses extra whitespace', () => {
    expect(normaliseTitle('  Artist   Title  ')).toBe('Artist Title');
  });

  it('truncates to 100 characters', () => {
    const long = 'A'.repeat(150);
    expect(normaliseTitle(long)).toHaveLength(100);
  });
});
