import { printResolvedAgentOsEnvSummary } from './load-env';

try {
  printResolvedAgentOsEnvSummary();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
