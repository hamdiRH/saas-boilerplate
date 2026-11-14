import 'server-only';
import { getSessionOrThrow } from './session';
import type { Session } from './session';

/** Wrap an action handler so it only runs for authenticated users: `createAction(schema, withAuth(handler))`. */
export function withAuth<Input, Result>(
  handler: (input: Input, context: { session: Session }) => Promise<Result>,
) {
  return async (input: Input): Promise<Result> =>
    handler(input, { session: await getSessionOrThrow() });
}
