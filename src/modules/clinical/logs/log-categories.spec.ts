import { UnprocessableEntityException } from '@nestjs/common';
import { LOG_KINDS, validateLogEntry } from './log-categories';

describe('validateLogEntry', () => {
  it('accepts a valid hygiene kind', () => {
    expect(() => validateLogEntry('hygiene', 'banho', 'pele íntegra')).not.toThrow();
  });

  it('rejects a kind not allowed for the category', () => {
    expect(() => validateLogEntry('hygiene', 'refeicao', null)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects an unknown kind', () => {
    expect(() => validateLogEntry('medical', 'banho', null)).toThrow(UnprocessableEntityException);
  });

  it('accepts a nutrition meal with a valid intake percentage', () => {
    expect(() => validateLogEntry('nutrition', 'refeicao', '50')).not.toThrow();
  });

  it('rejects a nutrition meal intake outside 0–100', () => {
    expect(() => validateLogEntry('nutrition', 'refeicao', '150')).toThrow(
      UnprocessableEntityException,
    );
  });

  it('allows a nutrition meal with no intake value', () => {
    expect(() => validateLogEntry('nutrition', 'refeicao', null)).not.toThrow();
  });

  it('exposes the allowed kinds per category', () => {
    expect(LOG_KINDS.hygiene).toContain('fralda');
    expect(LOG_KINDS.social).toContain('visita');
  });
});
