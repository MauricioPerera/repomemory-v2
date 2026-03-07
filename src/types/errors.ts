export type ErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_INPUT'
  | 'STORAGE_ERROR'
  | 'HASH_MISMATCH'
  | 'AI_NOT_CONFIGURED'
  | 'AI_ERROR'
  | 'SNAPSHOT_ERROR'
  | 'PARSE_ERROR'
  | 'MIDDLEWARE_CANCELLED';

export class RepoMemoryError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RepoMemoryError';
  }
}
