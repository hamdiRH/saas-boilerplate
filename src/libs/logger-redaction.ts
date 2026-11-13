import type { LogRecord, Sink } from '@logtape/logtape';

const SENSITIVE_KEY = /pass(?:word)?|token|secret|authorization|cookie|api[-_]?key/iu;
export const REDACTED = '[REDACTED]';

/** Deeply masks values whose KEY looks sensitive. Pure → easy to test. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[Truncated]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }

  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Error)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactValue(child, depth + 1),
      ]),
    );
  }

  return value;
}

/** Wraps a sink so every record is redacted before it is written anywhere. */
export function withRedaction(sink: Sink): Sink {
  return (record: LogRecord) =>
    sink({ ...record, properties: redactValue(record.properties) as Record<string, unknown> });
}
