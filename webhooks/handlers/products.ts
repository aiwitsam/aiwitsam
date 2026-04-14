/**
 * Product Webhook Handler
 *
 * Handles product lifecycle events from Dark Factory, Vantage, and
 * Grant Engine. Maps events to GHL contact creation and opportunity
 * stage updates.
 *
 * Event shape:
 *   {
 *     product: "dark-factory" | "vantage" | "grant-engine",
 *     event: string,
 *     data: Record<string, any>
 *   }
 */

import {
  ghlFetch,
  createOrUpdateContact,
  searchContacts,
  type WebhookResult,
} from "./ghl-api.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductName = "dark-factory" | "vantage" | "grant-engine";

interface ProductEvent {
  product: ProductName;
  event: string;
  data: Record<string, any>;
}

const VALID_PRODUCTS = new Set<string>(["dark-factory", "vantage", "grant-engine"]);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Process an incoming product lifecycle webhook event.
 *
 * @param body - Raw request body string
 * @returns WebhookResult with action taken
 */
export async function handleProductWebhook(body: string): Promise<WebhookResult> {
  let payload: ProductEvent;
  try {
    payload = JSON.parse(body);
  } catch {
    return { success: false, action: "none", error: "Invalid JSON body" };
  }

  if (!payload.product || !payload.event || !payload.data) {
    return {
      success: false,
      action: "none",
      error: "Missing required fields: product, event, data",
    };
  }

  if (!VALID_PRODUCTS.has(payload.product)) {
    return {
      success: false,
      action: "none",
      error: `Unknown product: ${payload.product}`,
    };
  }

  const eventKey = `${payload.product}/${payload.event}`;
  console.log(`[products] Received event: ${eventKey}`);

  try {
    switch (eventKey) {
      case "dark-factory/site-deployed":
        return await handleSiteDeployed(payload);

      case "dark-factory/client-signup":
        return await handleClientSignup(payload, "dark-factory");

      case "vantage/strategy-completed":
        return await handleStrategyCompleted(payload);

      case "grant-engine/org-onboarded":
        return await handleClientSignup(payload, "grant-engine");

      default:
        console.log(`[products] Unhandled event: ${eventKey}`);
        return { success: true, action: "ignored" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[products] Error handling ${eventKey}: ${message}`);
    return { success: false, action: "handler_error", error: message };
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * dark-factory/site-deployed
 * Updates the opportunity status in GHL for the given client.
 */
async function handleSiteDeployed(payload: ProductEvent): Promise<WebhookResult> {
  const { email, siteUrl, opportunityId } = payload.data;

  if (!opportunityId && !email) {
    return {
      success: false,
      action: "none",
      error: "site-deployed requires opportunityId or email",
    };
  }

  let oppId = opportunityId as string | undefined;

  // If no opportunity ID, try to find one via contact email
  if (!oppId && email) {
    oppId = await findOpportunityByEmail(email as string);
  }

  if (oppId) {
    await ghlFetch(`/opportunities/${oppId}`, "PUT", {
      status: "won",
      monetaryValue: payload.data.monetaryValue,
    });
    console.log(
      `[products] dark-factory/site-deployed — opportunity ${oppId} marked won (${siteUrl ?? "no URL"})`,
    );
  } else {
    console.log(
      `[products] dark-factory/site-deployed — no opportunity found for ${email}, skipping update`,
    );
  }

  return { success: true, action: "opportunity_updated" };
}

/**
 * dark-factory/client-signup and grant-engine/org-onboarded
 * Creates or updates a GHL contact with product-specific tags.
 */
async function handleClientSignup(
  payload: ProductEvent,
  product: ProductName,
): Promise<WebhookResult> {
  const { email, name, organization } = payload.data;

  if (!email) {
    return { success: false, action: "none", error: "client-signup requires email" };
  }

  const contactName = (name as string) || (organization as string) || email;
  const tags = [`${product}-customer`, payload.event];

  if (organization) {
    tags.push(`org:${organization}`);
  }

  const contactId = await createOrUpdateContact(email as string, contactName, tags);
  console.log(
    `[products] ${product}/${payload.event} — contact ${contactId} created/updated`,
  );

  return { success: true, action: "contact_created" };
}

/**
 * vantage/strategy-completed
 * Updates the opportunity and applies cross-sell tags for upsell flows.
 */
async function handleStrategyCompleted(payload: ProductEvent): Promise<WebhookResult> {
  const { email, strategyType, opportunityId } = payload.data;

  if (!email) {
    return {
      success: false,
      action: "none",
      error: "strategy-completed requires email",
    };
  }

  // Update contact with cross-sell tags
  const crossSellTags = [
    "vantage-strategy-complete",
    "cross-sell-eligible",
  ];
  if (strategyType) {
    crossSellTags.push(`strategy:${strategyType}`);
  }

  const contactId = await createOrUpdateContact(
    email as string,
    payload.data.name as string || email,
    crossSellTags,
  );

  // Update opportunity if provided or findable
  let oppId = opportunityId as string | undefined;
  if (!oppId) {
    oppId = await findOpportunityByEmail(email as string);
  }

  if (oppId) {
    await ghlFetch(`/opportunities/${oppId}`, "PUT", {
      status: "won",
      stageId: payload.data.stageId,
    });
    console.log(
      `[products] vantage/strategy-completed — opportunity ${oppId} updated, cross-sell tagged`,
    );
  } else {
    console.log(
      `[products] vantage/strategy-completed — contact ${contactId} tagged, no opportunity to update`,
    );
  }

  return { success: true, action: "opportunity_updated" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the first opportunity associated with a contact email.
 * Returns the opportunity ID or undefined if none found.
 */
async function findOpportunityByEmail(email: string): Promise<string | undefined> {
  const contacts = await searchContacts(email);
  if (contacts.length === 0) return undefined;

  const contactId = contacts[0].id as string;
  const locationId = process.env.GHL_LOCATION_ID;

  try {
    const data = await ghlFetch(
      `/opportunities/search?location_id=${locationId}&contact_id=${contactId}`,
      "GET",
    );
    const opportunities = data?.opportunities ?? [];
    if (opportunities.length > 0) {
      return opportunities[0].id as string;
    }
  } catch {
    // Opportunity search may fail if none exist — not an error
    console.log(`[products] No opportunities found for contact ${contactId}`);
  }

  return undefined;
}
