/**
 * Webhook Server
 *
 * Lightweight HTTP server that receives Stripe and product lifecycle
 * webhooks and forwards events to GoHighLevel via its REST API.
 *
 * Routes:
 *   POST /webhooks/stripe   → Stripe checkout/payment events
 *   POST /webhooks/product  → Dark Factory / Vantage / Grant Engine events
 *   GET  /health            → 200 OK with JSON status
 *
 * Usage:
 *   npx tsx webhooks/server.ts
 *   # or via package.json:
 *   npm run webhooks:start
 *
 * Environment:
 *   WEBHOOK_PORT (default 3900)
 *   WEBHOOK_HOST (default 127.0.0.1)
 *   STRIPE_WEBHOOK_SECRET
 *   GHL_API_TOKEN
 *   GHL_LOCATION_ID
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleStripeWebhook } from "./handlers/stripe.js";
import { handleProductWebhook } from "./handlers/products.js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

const PORT = Number(process.env.WEBHOOK_PORT) || 3900;
const HOST = process.env.WEBHOOK_HOST || "127.0.0.1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString();
}

function log(method: string, url: string, status: number, extra?: string): void {
  const msg = `[${timestamp()}] ${method} ${url} → ${status}`;
  console.log(extra ? `${msg} (${extra})` : msg);
}

/**
 * Read the full request body from the stream.
 * Rejects if body exceeds 1 MB to prevent abuse.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 1_048_576; // 1 MB

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(body);
}

function getHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  // Health check
  if (method === "GET" && url === "/health") {
    log(method, url, 200);
    sendJson(res, 200, {
      status: "ok",
      timestamp: timestamp(),
      uptime: process.uptime(),
    });
    return;
  }

  // Stripe webhook
  if (method === "POST" && url === "/webhooks/stripe") {
    try {
      const body = await readBody(req);
      const headers = getHeaders(req);
      const result = await handleStripeWebhook(body, headers);
      const status = result.success ? 200 : 400;
      log(method, url, status, result.action);
      sendJson(res, status, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${timestamp()}] Stripe handler error: ${message}`);
      log(method, url, 500);
      sendJson(res, 500, { success: false, action: "server_error", error: message });
    }
    return;
  }

  // Product webhook
  if (method === "POST" && url === "/webhooks/product") {
    try {
      const body = await readBody(req);
      const result = await handleProductWebhook(body);
      const status = result.success ? 200 : 400;
      log(method, url, status, result.action);
      sendJson(res, status, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${timestamp()}] Product handler error: ${message}`);
      log(method, url, 500);
      sendJson(res, 500, { success: false, action: "server_error", error: message });
    }
    return;
  }

  // 404
  log(method, url, 404);
  sendJson(res, 404, { error: "Not found" });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error(`[${timestamp()}] Unhandled error:`, err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[${timestamp()}] Webhook server listening on http://${HOST}:${PORT}`);
  console.log(`  POST /webhooks/stripe   — Stripe events`);
  console.log(`  POST /webhooks/product  — Product lifecycle events`);
  console.log(`  GET  /health            — Health check`);
});

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n[${timestamp()}] ${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  });
}
