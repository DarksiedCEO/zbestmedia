import { printResolvedArtifactEnvSummary } from "./load-env";

try {
  printResolvedArtifactEnvSummary();
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : "[artifacts:env] unknown error";
  console.error(message);
  process.exit(1);
}
