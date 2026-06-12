import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
}

/**
 * Uniform error shape for the whole API (api-contract-keeper rule 4):
 * { statusCode, error, message, details? }
 * Never leaks stack traces or internals in the response body.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body: ErrorBody =
        typeof payload === 'string'
          ? { statusCode: status, error: exception.name, message: payload }
          : {
              statusCode: status,
              error: (payload as ErrorBody).error ?? exception.name,
              message: (payload as ErrorBody).message ?? exception.message,
              ...((payload as ErrorBody).details !== undefined && {
                details: (payload as ErrorBody).details,
              }),
            };
      response.status(status).json(body);
      return;
    }

    // Unknown error: log it server-side (no PII — message only), return opaque 500.
    this.logger.error(
      exception instanceof Error ? exception.message : 'Unknown error',
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Internal server error',
    } satisfies ErrorBody);
  }
}
