import fs from "node:fs";
import path from "node:path";

import type { LoadRunSloEvent } from "../schema";

export function emitLoadRunSloEventToFile(args: {
  event: LoadRunSloEvent;
  jsonlPath: string;
  archiveDir: string;
}): void {
  const line = `${JSON.stringify(args.event)}\n`;
  fs.mkdirSync(path.dirname(args.jsonlPath), { recursive: true });
  fs.mkdirSync(args.archiveDir, { recursive: true });

  fs.appendFileSync(args.jsonlPath, line, "utf8");

  const day = args.event.ts.slice(0, 10);
  const archivePath = path.join(args.archiveDir, `${day}.loadrun_events.jsonl`);
  fs.appendFileSync(archivePath, line, "utf8");
}
