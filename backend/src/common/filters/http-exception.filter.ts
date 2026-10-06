import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const message = typeof exceptionResponse === 'object' && exceptionResponse !== null
      ? (exceptionResponse as { message?: string | string[] }).message
      : undefined;

    response.status(status).json({
      statusCode: status,
      message: message ?? (status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal server error' : 'Request failed'),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}