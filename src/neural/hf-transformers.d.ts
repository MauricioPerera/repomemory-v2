/**
 * Type declarations for @huggingface/transformers (optional peer dependency).
 * This allows TypeScript to resolve the import even when the package isn't installed.
 */
declare module '@huggingface/transformers' {
  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}
