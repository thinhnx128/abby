import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type AbbyConfig, abbyConfigSchema } from "@tryabby/core";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import { loadFile, parseModule, writeFile } from "magicast";
import polka from "polka";
import portFinder from "portfinder";
import { loadConfig } from "unconfig";
import { ABBY_BASE_URL } from "./consts";

export async function loadLocalConfig({
  configPath,
  cwd: initialCwd,
}: {
  configPath?: string;
  cwd?: string;
}) {
  loadEnv({ path: initialCwd ? path.resolve(initialCwd, ".env") : "" });

  let cwd = initialCwd ?? process.cwd();
  let fileName = "abby.config";
  let extensions = ["ts", "js", "mjs", "cjs"];

  // if configPath is provided, use it to load the config
  if (configPath) {
    const config = path.resolve(configPath);

    cwd = path.dirname(config);
    fileName = path.basename(config, path.extname(config));
    extensions = [path.extname(config).slice(1)];
  }

  const { config, sources } = await loadConfig({
    sources: [
      {
        files: fileName,
        extensions,
      },
    ],
    cwd,
  });

  if (!config || !sources[0]) throw new Error("Could not load config file");

  const result = await abbyConfigSchema.safeParseAsync(config);
  if (!result.success) {
    console.error(result.error);
    throw new Error("Invalid config file");
  }
  const originalConfig = await fs.readFile(sources[0], "utf-8");
  const mod = await loadFile(sources[0]);
  if (mod.exports.default.$type !== "function-call")
    throw new Error("Invalid config file");

  return {
    config: result.data,
    configFilePath: sources[0],
    mutableConfig: mod.exports.default.$args[1] as AbbyConfig,
    saveMutableConfig: () => writeFile(mod, sources[0]),
    restoreConfig: () => {
      const mod = parseModule(originalConfig);
      return writeFile(mod, sources[0]);
    },
  };
}

export function multiLineLog(...args: any[]) {
  console.log(args.join("\n"));
}

export async function startServerAndGetToken(host?: string) {
  const freePort = await portFinder.getPortPromise();
  const expectedState = crypto.randomBytes(32).toString("hex");

  const url = new URL(host ?? ABBY_BASE_URL);
  const allowedOrigin = url.origin;
  url.pathname = "/profile/generate-token";

  const callbackUrl = new URL(`http://127.0.0.1:${freePort}`);
  callbackUrl.searchParams.set("state", expectedState);
  url.searchParams.set("callbackUrl", callbackUrl.toString());
  url.searchParams.set("state", expectedState);
  console.log(`Please open the following URL in your Browser: ${url}`);

  return new Promise<string>((resolve) => {
    const server = polka()
      .use(
        cors({
          origin: allowedOrigin,
          methods: ["GET"],
        })
      )
      .get("/", (req, res) => {
        const token = req.query.token;
        const state = req.query.state;
        const stateBuf = typeof state === "string" ? Buffer.from(state) : null;
        const expectedBuf = Buffer.from(expectedState);
        const isValidState =
          stateBuf !== null &&
          stateBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(stateBuf, expectedBuf);

        if (!isValidState) {
          res.statusCode = 403;
          res.end("Invalid or missing OAuth state parameter");
          return;
        }
        if (typeof token !== "string" || token.trim().length === 0) {
          res.statusCode = 400;
          res.end("Invalid token");
          return;
        }
        res.statusCode = 200;
        res.end();

        server.server?.close();
        resolve(token);
      })
      .listen(freePort, "127.0.0.1");

    process.on("SIGTERM", () => {
      server.server?.closeAllConnections();
      server.server?.close();
    });
  });
}
