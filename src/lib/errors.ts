export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Необходима авторизация') {
    super(401, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Не найдено') {
    super(404, message);
  }
}

export class ValidationError extends AppError {
  constructor(errors: Record<string, string[]>, message = 'Ошибка валидации') {
    super(422, message, errors);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Доступ запрещён') {
    super(403, message);
  }
}
