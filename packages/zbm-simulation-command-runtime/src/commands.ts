import type { ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
import { acceptedResultSchema, commandSchema, lookupResultSchema, parseRequest, RuntimeError, type AcceptedResult } from './contracts';
import type { Connections } from './connections';
import { verifyCommandResult } from './identity';

export async function submitCommand(database: Connections, binding: ConnectionBinding, input: unknown): Promise<AcceptedResult> {
  const command = parseRequest(commandSchema, input);
  const lookupSchema = lookupResultSchema.transform(result => {
    if (result.found) {
      verifyCommandResult(result, command);
      if (!result.replay) throw new RuntimeError(500, 'internal');
    }
    return result;
  });
  const lookup = await database.call(binding, command.scope, 'submit', [JSON.stringify(command), true], lookupSchema);
  if (lookup.found) return lookup;
  // Exactly one fresh transaction after MISS; SQL rechecks replay before executing or validating approvals.
  return database.call(binding, command.scope, 'submit', [JSON.stringify(command), false],
    acceptedResultSchema.transform(result => verifyCommandResult(result, command)));
}
