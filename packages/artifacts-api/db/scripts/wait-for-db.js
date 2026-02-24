/* eslint-disable no-console */
const net = require("node:net");
const { resolveDbUrl } = require("./resolve-db-url");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseHostPort(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: Number(parsed.port || 5432)
    };
  } catch {
    return { host: "localhost", port: 5432 };
  }
}

async function waitForDb(databaseUrl, timeoutMs = 60_000) {
  const { host, port } = parseHostPort(databaseUrl);
  console.log(`[db] waiting for ${host}:${port} ...`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(1_000);
      socket.on("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("error", () => resolve(false));
    });

    if (ok) {
      console.log("[db] reachable");
      return;
    }

    await sleep(500);
  }

  throw new Error(`[db] Postgres not reachable at ${host}:${port} after ${timeoutMs}ms`);
}

async function main() {
  const dbUrl = resolveDbUrl();
  await waitForDb(dbUrl);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { waitForDb };
