import { ABBY_WINDOW_KEY, type AbbyDataResponse } from "@tryabby/core";
import { Hono } from "hono";
import { ZoneCache } from "./lib/cache";

import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { timing } from "hono/timing";
import { ConfigService } from "./lib/config";

const cache = new ZoneCache<{
  config: AbbyDataResponse;
}>({
  cloudflareApiKey: "",
  domain: "cache.tryabby.com",
  fresh: 60 * 1000,
  stale: 60 * 1000,
  zoneId: "",
});

const configCache = new ConfigService(cache);

export function safeSerializeForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\//g, "\\u002f")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const app = new Hono()
  .use(
    "*",
    cors({
      origin: "*",
      maxAge: 60 * 60 * 24 * 30,
    })
  )
  .use("*", timing())
  .use("*", logger())
  .get("/:projectId/:environment", async (c) => {
    const environment = c.req.param("environment");
    const projectId = c.req.param("projectId");

    const [data, , reason] = await configCache.retrieveConfig({
      c,
      environment,
      projectId,
    });

    c.header("x-abby-cache", reason);
    return c.json(data);
  })
  .get("/:projectId/:environment/script.js", async (c) => {
    const environment = c.req.param("environment");
    const projectId = c.req.param("projectId");

    const [data, , reason] = await configCache.retrieveConfig({
      c,
      environment,
      projectId,
    });

    c.header("x-abby-cache", reason);

    const script = `window.${ABBY_WINDOW_KEY} = ${safeSerializeForScript(data)};`;

    return c.text(script, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

export default app;
