/**
 * Reintentos con delays para operaciones de red (Ollama, APIs externas).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delays?: number[] } = {},
): Promise<T> {
  const { maxAttempts = 3, delays = [1000, 3000] } = options;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        /fetch|network|timeout|ECONNREFUSED|ETIMEDOUT|AbortError|aborted/i.test(
          lastError.message,
        );
      if (!isRetryable || attempt === maxAttempts - 1) {
        throw lastError;
      }
      const delay = delays[attempt] ?? delays[delays.length - 1];
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
