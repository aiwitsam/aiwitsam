/**
 * Stripe Webhook Handler
 *
 * Verifies Stripe webhook signatures using HMAC-SHA256 and processes
 * checkout.session.completed events by creating/updating contacts in GHL.
 *
 * Signature verification follows the Stripe v1 scheme:
 *   1. Parse t= and v1= from the stripe-signature header
 *   2. Compute HMAC-SHA256 of "${timestamp}.${rawBody}"
 *   3. Compare with timingSafeEqual to prevent timing attacks
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createOrUpdateContact, type WebhookResult } from "./ghl-api.js";

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

interface StripeSignatureParts {
  timestamp: string;
  signature: string;
}

function parseStripeSignature(header: string): StripeSignatureParts {
  const parts: Record<string, string> = {};
  for (const pair of header.split(",")) {
    const [key, value] = pair.split("=", 2);
    if (key && value) {
      parts[key.trim()] = value.trim();
    }
  }

  if (!parts.t || !parts.v1) {
    throw new Error("Invalid stripe-signature header: missing t or v1");
  }

  return { timestamp: parts.t, signature: parts.v1 };
}

function verifySignature(rawBody: string, header: string, secret: string): void {
  const { timestamp, signature } = parseStripeSignature(header);

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    throw new Error("Stripe signature verification failed: length mismatch");
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error("Stripe signature verification failed: signature mismatch");
  }

  // Guard against replay attacks — reject timestamps older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) {
    throw new Error("Stripe signature verification failed: timestamp too old");
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Process an incoming Stripe webhook event.
 *
 * @param body    - Raw request body string
 * @param headers - Lowercased request headers
 * @returns WebhookResult with action taken
 */
export async function handleStripeWebhook(
  body: string,
  headers: Record<string, string>,
): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return { success: false, action: "none", error: "STRIPE_WEBHOOK_SECRET not configured" };
  }

  // Verify signature
  const sigHeader = headers["stripe-signature"];
  if (!sigHeader) {
    return { success: false, action: "none", error: "Missing stripe-signature header" };
  }

  try {
    verifySignature(body, sigHeader, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe] Signature verification failed: ${message}`);
    return { success: false, action: "none", error: message };
  }

  // Parse event
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return { success: false, action: "none", error: "Invalid JSON body" };
  }

  const eventType = event?.type as string | undefined;
  console.log(`[stripe] Received event: ${eventType ?? "unknown"}`);

  // Route by event type
  if (eventType === "checkout.session.completed") {
    return handleCheckoutCompleted(event);
  }

  // Acknowledge unhandled event types without error
  return { success: true, action: "ignored", error: undefined };
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(event: any): Promise<WebhookResult> {
  const session = event.data?.object;
  if (!session) {
    return { success: false, action: "none", error: "Missing session data in event" };
  }

  const email = session.customer_email ?? session.customer_details?.email;
  const name = session.customer_details?.name ?? session.customer_email ?? "Unknown";
  const amount = session.amount_total;

  if (!email) {
    return { success: false, action: "none", error: "No customer email in checkout session" };
  }

  console.log(
    `[stripe] checkout.session.completed — ${name} (${email}), amount: ${amount ?? "n/a"}`,
  );

  try {
    const tags = ["stripe-customer", "checkout-completed"];
    if (amount) {
      tags.push(`purchase-${amount}`);
    }

    const contactId = await createOrUpdateContact(email, name, tags);
    console.log(`[stripe] Contact created/updated in GHL: ${contactId}`);

    return { success: true, action: "contact_created" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe] Failed to sync contact to GHL: ${message}`);
    return { success: false, action: "contact_create_failed", error: message };
  }
}
