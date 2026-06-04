import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors.js';
import {
  buildClientErrorPayload,
  inferErrorCode,
  serializeError,
  shouldExposeErrorDetails,
} from '../lib/errorUtil.js';
import { validationErrors } from '../lib/response.js';
import type { ApiErrorInfo } from '../lib/response.js';

function logRequestError(
  request: FastifyRequest,
  error: unknown,
  statusCode: number,
) {
  const serialized = serializeError(error);
  request.log.error(
    {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode,
      errorCode: serialized.code,
      err: error instanceof Error ? error : undefined,
      message: serialized.message,
      detail: serialized.detail,
    },
    'request failed',
  );
}

function apiError(
  error: unknown,
  requestId: string,
  code?: string,
  detail?: string,
): ApiErrorInfo {
  const serialized = serializeError(error);
  const payload = buildClientErrorPayload(error, requestId);
  return {
    code: code ?? payload?.code ?? serialized.code,
    detail: detail ?? payload?.detail,
    requestId: payload?.requestId ?? requestId,
  };
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const requestId = request.id;

  if (error instanceof AppError) {
    logRequestError(request, error, error.statusCode);
    return reply.status(error.statusCode).send({
      success: false,
      errors: error.errors,
      message: error.message,
      data: null,
      error: apiError(error, requestId, error.code, error.detail),
    });
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'form';
      fieldErrors[key] = fieldErrors[key] ?? [];
      fieldErrors[key].push(issue.message);
    }
    const { errors, message } = validationErrors(fieldErrors);
    logRequestError(request, error, 422);
    return reply.status(422).send({
      success: false,
      errors,
      message,
      data: null,
      error: apiError(error, requestId, 'VALIDATION'),
    });
  }

  if (error.validation) {
    logRequestError(request, error, 422);
    return reply.status(422).send({
      success: false,
      errors: { form: [error.message] },
      message: 'Ошибка валидации',
      data: null,
      error: apiError(error, requestId, 'VALIDATION'),
    });
  }

  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  logRequestError(request, error, statusCode);

  const serialized = serializeError(error);
  const message = shouldExposeErrorDetails()
    ? serialized.message || 'Внутренняя ошибка сервера'
    : 'Внутренняя ошибка сервера';

  return reply.status(statusCode).send({
    success: false,
    errors: null,
    message,
    data: null,
    error: {
      code: inferErrorCode(serialized.message),
      detail: shouldExposeErrorDetails() ? serialized.detail : undefined,
      requestId,
    },
  });
}
