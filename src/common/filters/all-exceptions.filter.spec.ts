import { ArgumentsHost, ConflictException, HttpStatus, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

beforeAll(() => Logger.overrideLogger(false));
afterAll(() => Logger.overrideLogger(true));

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('formats HttpException into the uniform error shape', () => {
    const { host, status, json } = mockHost();
    filter.catch(new ConflictException('already confirmed'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: 'already confirmed',
      }),
    );
  });

  it('preserves a details payload on domain conflicts', () => {
    const { host, json } = mockHost();
    filter.catch(
      new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: 'AlreadyAdministered',
        message: 'já confirmada',
        details: { confirmed_by: 'user-1', confirmed_at: '2026-06-12T10:00:00Z' },
      }),
      host,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'AlreadyAdministered',
        details: { confirmed_by: 'user-1', confirmed_at: '2026-06-12T10:00:00Z' },
      }),
    );
  });

  it('returns an opaque 500 for unknown errors (no stack, no internals)', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('secret internal detail'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });
});
