import { UnprocessableEntityException } from '@nestjs/common';
import { ConfirmAdministrationDto } from '../clinical/emar/dto/administration.dto';
import { CreateVitalDto } from '../clinical/vitals/dto/vital.dto';
import { toValidatedInstance } from './validate-payload';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('toValidatedInstance (sync payload validation)', () => {
  it('returns a typed instance for a valid vital payload', () => {
    const dto = toValidatedInstance(CreateVitalDto, {
      metric: 'bp',
      value: { sys: 120, dia: 80 },
      client_id: UUID,
    });
    expect(dto).toBeInstanceOf(CreateVitalDto);
    expect(dto.metric).toBe('bp');
  });

  it('throws 422 when metric is not a known enum', () => {
    expect(() => toValidatedInstance(CreateVitalDto, { metric: 'weight', value: {} })).toThrow(
      UnprocessableEntityException,
    );
  });

  it('throws 422 when client_id is not a UUID', () => {
    expect(() =>
      toValidatedInstance(CreateVitalDto, {
        metric: 'hr',
        value: { value: 70 },
        client_id: 'nope',
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('throws 422 when a confirm note exceeds the max length', () => {
    expect(() => toValidatedInstance(ConfirmAdministrationDto, { notes: 'x'.repeat(501) })).toThrow(
      UnprocessableEntityException,
    );
  });

  it('accepts a valid confirm payload', () => {
    const dto = toValidatedInstance(ConfirmAdministrationDto, { notes: 'ok', client_id: UUID });
    expect(dto.notes).toBe('ok');
  });
});
