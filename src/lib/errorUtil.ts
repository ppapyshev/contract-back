import { env } from '../config/env.js';

export type SerializedError = {
  code: string;
  message: string;
  detail: string;
};

const GIGACHAT_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /oauth/i, code: 'GIGACHAT_OAUTH' },
  { pattern: /upload/i, code: 'GIGACHAT_UPLOAD' },
  { pattern: /ocr/i, code: 'GIGACHAT_OCR' },
  { pattern: /chat error/i, code: 'GIGACHAT_CHAT' },
  { pattern: /gigachat/i, code: 'GIGACHAT' },
];

export function shouldExposeErrorDetails(): boolean {
  if (env.EXPOSE_ERROR_DETAILS === 'true') return true;
  if (env.EXPOSE_ERROR_DETAILS === 'false') return false;
  return env.NODE_ENV !== 'production';
}

export function inferErrorCode(message: string): string {
  for (const { pattern, code } of GIGACHAT_PATTERNS) {
    if (pattern.test(message)) return code;
  }
  if (/validation|zod/i.test(message)) return 'VALIDATION';
  if (/not found/i.test(message)) return 'NOT_FOUND';
  if (/unauthorized|jwt/i.test(message)) return 'UNAUTHORIZED';
  return 'INTERNAL';
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    const message = err.message || 'Unknown error';
    const cause =
      err.cause instanceof Error
        ? err.cause.message
        : err.cause != null
          ? String(err.cause)
          : '';
    const detail = [message, cause].filter(Boolean).join(' | ').slice(0, 4000);
    return {
      code: inferErrorCode(message),
      message,
      detail,
    };
  }

  const message = String(err);
  return {
    code: inferErrorCode(message),
    message,
    detail: message.slice(0, 4000),
  };
}

export function buildClientErrorPayload(
  err: unknown,
  requestId?: string,
): { code: string; detail?: string; requestId?: string } | undefined {
  if (!shouldExposeErrorDetails()) {
    return requestId ? { code: inferErrorCode(String(err)), requestId } : undefined;
  }

  const serialized = serializeError(err);
  return {
    code: serialized.code,
    detail: serialized.detail,
    requestId,
  };
}

export function userMessageFromError(
  err: unknown,
  fallback: string,
): string {
  const { code, message } = serializeError(err);

  if (code.startsWith('GIGACHAT_OAUTH')) {
    return 'Ошибка авторизации GigaChat. Проверьте GIGACHAT_AUTH_KEY на сервере.';
  }
  if (code.startsWith('GIGACHAT')) {
    return 'Сервис ИИ временно недоступен. Попробуйте позже.';
  }

  if (shouldExposeErrorDetails() && message) {
    return `${fallback}: ${message}`;
  }

  return fallback;
}
