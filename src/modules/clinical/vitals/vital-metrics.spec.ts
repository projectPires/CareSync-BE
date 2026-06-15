import { isAbnormal, validateVitalValue } from './vital-metrics';

describe('validateVitalValue', () => {
  it('bp requires sys + dia integers', () => {
    expect(validateVitalValue('bp', { sys: 120, dia: 80 })).toEqual({ sys: 120, dia: 80 });
    expect(() => validateVitalValue('bp', { sys: 120 })).toThrow();
    expect(() => validateVitalValue('bp', { value: 120 })).toThrow();
  });

  it('single-value metrics require a numeric value', () => {
    expect(validateVitalValue('hr', { value: 72 })).toEqual({ value: 72 });
    expect(() => validateVitalValue('hr', { value: 'fast' })).toThrow();
    expect(() => validateVitalValue('spo2', {})).toThrow();
  });

  it('pain is bounded 0–10', () => {
    expect(validateVitalValue('pain', { value: 7 })).toEqual({ value: 7 });
    expect(() => validateVitalValue('pain', { value: 11 })).toThrow();
    expect(() => validateVitalValue('pain', { value: -1 })).toThrow();
  });

  it('temp accepts decimals', () => {
    expect(validateVitalValue('temp', { value: 37.4 })).toEqual({ value: 37.4 });
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => validateVitalValue('hr', { value: 72, extra: 1 })).toThrow();
  });
});

describe('isAbnormal — thresholds (Notion §6 M2)', () => {
  const cases: [Parameters<typeof isAbnormal>[0], object, boolean][] = [
    ['bp', { sys: 150, dia: 80 }, true], // sys > 140
    ['bp', { sys: 85, dia: 60 }, true], // sys < 90
    ['bp', { sys: 120, dia: 80 }, false],
    ['hr', { value: 110 }, true], // > 100
    ['hr', { value: 45 }, true], // < 50
    ['hr', { value: 72 }, false],
    ['spo2', { value: 90 }, true], // < 92
    ['spo2', { value: 96 }, false],
    ['temp', { value: 38.5 }, true], // > 38
    ['temp', { value: 37 }, false],
    ['glucose', { value: 60 }, true], // < 70
    ['glucose', { value: 300 }, true], // > 250
    ['glucose', { value: 100 }, false],
    ['pain', { value: 4 }, true], // >= 4
    ['pain', { value: 3 }, false],
  ];
  for (const [metric, value, expected] of cases) {
    it(`${metric} ${JSON.stringify(value)} → abnormal=${expected}`, () => {
      expect(isAbnormal(metric, value)).toBe(expected);
    });
  }
});
