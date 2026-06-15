import { AdministrationStatus } from '@prisma/client';
import {
  assertValidTransition,
  isValidAdministrationTransition,
} from './administration-state-machine';

const ALL: AdministrationStatus[] = ['pending', 'taken', 'refused', 'delayed', 'missed'];

// Exhaustive truth table (Notion §7 lifecycle + clinical hard rule 3).
// pending → taken | refused | delayed ; delayed → taken | missed. Nothing else.
const VALID = new Set([
  'pending>taken',
  'pending>refused',
  'pending>delayed',
  'delayed>taken',
  'delayed>missed',
]);

describe('administration state machine', () => {
  describe('isValidAdministrationTransition — full 5×5 matrix', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = VALID.has(`${from}>${to}`);
        it(`${from} → ${to} = ${expected ? 'valid' : 'invalid'}`, () => {
          expect(isValidAdministrationTransition(from, to)).toBe(expected);
        });
      }
    }
  });

  it('taken is terminal — every onward transition is invalid', () => {
    for (const to of ALL) expect(isValidAdministrationTransition('taken', to)).toBe(false);
  });

  it('refused is terminal', () => {
    for (const to of ALL) expect(isValidAdministrationTransition('refused', to)).toBe(false);
  });

  it('missed is terminal', () => {
    for (const to of ALL) expect(isValidAdministrationTransition('missed', to)).toBe(false);
  });

  it('pending cannot jump straight to missed (only via delayed)', () => {
    expect(isValidAdministrationTransition('pending', 'missed')).toBe(false);
  });

  it('delayed cannot go to refused (only taken or missed)', () => {
    expect(isValidAdministrationTransition('delayed', 'refused')).toBe(false);
  });

  describe('assertValidTransition', () => {
    it('does not throw on a valid transition', () => {
      expect(() => assertValidTransition('pending', 'taken')).not.toThrow();
    });

    it('throws on an invalid transition (taken → refused)', () => {
      expect(() => assertValidTransition('taken', 'refused')).toThrow();
    });
  });
});
