export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export class UpstreamApiError extends ApiError {
  constructor(source: string, message: string, details?: unknown) {
    super(502, `${source} request failed: ${message}`, details);
    this.name = 'UpstreamApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}
