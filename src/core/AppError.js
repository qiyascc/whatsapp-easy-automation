export class AppError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }

  toResponse() {
    const body = { error: this.code, message: this.message };
    if (this.details) Object.assign(body, this.details);
    return body;
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super('invalid_request', message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super('unauthorized', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient scope for this operation.') {
    super('forbidden', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('not_found', `${resource} was not found.`, 404);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds) {
    super('rate_limited', 'Too many requests. Try again later.', 429, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super('conflict', message, 409);
  }
}
