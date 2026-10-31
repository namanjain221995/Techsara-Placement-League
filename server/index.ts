import os from "node:os";
import { buildServer } from "./app";
import { config } from "./config";

async function main() {
  const t0 = Date.now();
  const built = await buildServer({ withNext: true });
  await new Promise<void>((resolve) => built.server.listen(config.port, config.host, resolve));

  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${config.port}`);
  console.log(`\n  TechSara Placement League ready in ${((Date.now() - t0) / 1000).toFixed(1)}s (${config.dev ? "development" : "production"})`);
  console.log(`  Organizer console : ${config.publicUrl || `http://localhost:${config.port}`}/admin`);
  if (config.publicUrl) console.log("  On your network   : this computer's IP address with the same port  (projector / other laptops)");
  else for (const url of lan) console.log(`  On your network   : ${url}  (projector / other laptops)`);
  console.log("");

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`\n[server] ${signal} received, shutting down…`);
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    await built.close().catch((e) => console.error(e));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
