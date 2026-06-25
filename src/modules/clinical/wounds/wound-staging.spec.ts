import { UnprocessableEntityException } from '@nestjs/common';
import {
  assertValidDressing,
  assertValidGrade,
  assertValidZone,
  SEVERE_GRADE,
} from './wound-staging';

describe('wound staging validation', () => {
  it('accepts a known body-map zone', () => {
    expect(() => assertValidZone('sacro')).not.toThrow();
  });

  it('rejects an unknown zone', () => {
    expect(() => assertValidZone('joelho')).toThrow(UnprocessableEntityException);
  });

  it('accepts wound grade within 1–4 (floor 1)', () => {
    expect(() => assertValidGrade(2, 1)).not.toThrow();
  });

  it('rejects wound grade 0 (floor 1 — a wound is at least grade 1)', () => {
    expect(() => assertValidGrade(0, 1)).toThrow(UnprocessableEntityException);
  });

  it('accepts evolution grade 0 (floor 0 — healed/healthy)', () => {
    expect(() => assertValidGrade(0, 0)).not.toThrow();
  });

  it('rejects grade above 4', () => {
    expect(() => assertValidGrade(5, 0)).toThrow(UnprocessableEntityException);
  });

  it('rejects a non-integer grade', () => {
    expect(() => assertValidGrade(2.5, 1)).toThrow(UnprocessableEntityException);
  });

  it('accepts a known dressing and tolerates null', () => {
    expect(() => assertValidDressing('espuma')).not.toThrow();
    expect(() => assertValidDressing(null)).not.toThrow();
  });

  it('rejects an unknown dressing', () => {
    expect(() => assertValidDressing('gaze')).toThrow(UnprocessableEntityException);
  });

  it('treats grade >= 3 as severe (nurse+ only)', () => {
    expect(SEVERE_GRADE).toBe(3);
  });
});
