import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors.js';
import { validationErrors } from '../lib/response.js';

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      errors: error.errors,
      message: error.message,
      data: null,
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
    return reply.status(422).send({
      success: false,
      errors,
      message,
      data: null,
    });
  }

  if (error.validation) {
    return reply.status(422).send({
      success: false,
      errors: { form: [error.message] },
      message: 'Ошибка валидации',
      data: null,
    });
  }

  console.error(error);
  return reply.status(500).send({
    success: false,
    errors: null,
    message: 'Внутренняя ошибка сервера',
    data: null,
  });
}
