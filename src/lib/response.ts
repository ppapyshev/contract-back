import type { FastifyReply } from 'fastify';

export type ApiErrorInfo = {
  code: string;
  detail?: string;
  requestId?: string;
};

export type ApiResponse<T = unknown> = {
  success: boolean;
  errors: Record<string, string[]> | null;
  message: string | null;
  data: T | T[] | null;
  error?: ApiErrorInfo | null;
};

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.status(statusCode).send({
    success: true,
    errors: null,
    message: null,
    data,
    error: null,
  } satisfies ApiResponse<T>);
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  errors: Record<string, string[]> | null = null,
  error?: ApiErrorInfo | null,
) {
  return reply.status(statusCode).send({
    success: false,
    errors,
    message,
    data: null,
    error: error ?? null,
  } satisfies ApiResponse<null>);
}

export function validationErrors(errors: Record<string, string[]>) {
  return { errors, message: 'Ошибка валидации' };
}
