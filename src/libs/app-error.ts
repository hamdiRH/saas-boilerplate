export interface AppErrorOptions {
  code: string;
  httpStatus: number;
  /** Full i18n key (e.g. "errors.notFound") — always safe to show to users. */
  messageKey: string;
  /** Developer-facing detail. Never shown to users unless `expose` is true. */
  message?: string;
  cause?: unknown;
  expose?: boolean;
}

export type ErrorInit = Pick<AppErrorOptions, 'cause' | 'message'>;

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly messageKey: string;
  readonly expose: boolean;

  constructor({ code, httpStatus, messageKey, message, cause, expose = false }: AppErrorOptions) {
    super(message ?? messageKey, { cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.messageKey = messageKey;
    this.expose = expose;
  }
}
