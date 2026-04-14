/**
 * GHL API Helper
 *
 * Shared types and API wrapper for GoHighLevel REST API calls.
 * Used by both Stripe and product webhook handlers.
 *
 * All requests go through ghlFetch() which attaches auth headers
 * and the required API version header.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookResult {
  success: boolean;
  action: string;
  error?: string;
}

interface GHLContactPayload {
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  locationId: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Config (read at import time — .env must be loaded before this module)
// ---------------------------------------------------------------------------

const GHL_API_TOKEN = process.env.GHL_API_TOKEN ?? "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? "";
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

function ensureConfig(): void {
  if (!GHL_API_TOKEN) {
    throw new Error("GHL_API_TOKEN is not set in environment");
  }
  if (!GHL_LOCATION_ID) {
    throw new Error("GHL_LOCATION_ID is not set in environment");
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Authenticated fetch against the GHL REST API.
 *
 * @param path   - API path (e.g. "/contacts/")
 * @param method - HTTP method
 * @param body   - Optional JSON body
 * @returns Parsed JSON response
 */
export async function ghlFetch(
  path: string,
  method: string,
  body?: object,
): Promise<any> {
  ensureConfig();

  const url = `${GHL_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GHL_API_TOKEN}`,
    Version: GHL_API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`GHL API ${method} ${path} → ${res.status}: ${text}`);
  }

  // Some endpoints return 204 with no body
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Contact helpers
// ---------------------------------------------------------------------------

/**
 * Search contacts by email address.
 *
 * @param email - Email to search for
 * @returns Array of matching contact objects
 */
export async function searchContacts(email: string): Promise<any[]> {
  const data = await ghlFetch(
    `/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(email)}`,
    "GET",
  );
  return data?.contacts ?? [];
}

/**
 * Create a new contact or update an existing one (matched by email).
 * Returns the contact ID.
 *
 * @param email - Contact email
 * @param name  - Full name (split on first space for first/last)
 * @param tags  - Optional tags to apply
 * @returns Contact ID string
 */
export async function createOrUpdateContact(
  email: string,
  name: string,
  tags?: string[],
): Promise<string> {
  const existing = await searchContacts(email);

  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || undefined;

  if (existing.length > 0) {
    const contactId = existing[0].id as string;
    const updateBody: Record<string, any> = {};
    if (firstName) updateBody.firstName = firstName;
    if (lastName) updateBody.lastName = lastName;
    if (tags && tags.length > 0) updateBody.tags = tags;

    if (Object.keys(updateBody).length > 0) {
      await ghlFetch(`/contacts/${contactId}`, "PUT", updateBody);
    }

    console.log(`[ghl-api] Updated existing contact ${contactId} (${email})`);
    return contactId;
  }

  const payload: GHLContactPayload = {
    email,
    name,
    firstName,
    locationId: GHL_LOCATION_ID,
  };
  if (lastName) payload.lastName = lastName;
  if (tags && tags.length > 0) payload.tags = tags;

  const data = await ghlFetch("/contacts/", "POST", payload);
  const contactId = data?.contact?.id as string;
  console.log(`[ghl-api] Created new contact ${contactId} (${email})`);
  return contactId;
}
