import { Router } from "express";
import crypto from "crypto";
import { getExpense } from "../services/expenseService.js";

export const webhookRouter = Router();

/**
 * Validate Xero webhook signature.
 * Xero signs payloads with HMAC-SHA256 using your webhook key.
 * https://developer.xero.com/documentation/guides/webhooks/overview/
 */
function validateXeroSignature(req) {
  const webhookKey = process.env.XERO_WEBHOOK_KEY;
  if (!webhookKey) {
    console.warn("XERO_WEBHOOK_KEY not set — skipping signature validation");
    return true;
  }

  const receivedSignature = req.headers["x-xero-signature"];
  if (!receivedSignature) return false;

  const computed = crypto
    .createHmac("sha256", webhookKey)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(receivedSignature)
  );
}

/**
 * POST /webhooks/xero
 * Xero sends INVOICE events here when an invoice status changes.
 *
 * Xero requires a 200 response to the "Intent to Receive" validation ping.
 */
webhookRouter.post("/xero", async (req, res) => {
  // Xero "Intent to Receive" handshake - always respond 200 immediately
  if (!req.body || !req.body.events) {
    return res.sendStatus(200);
  }

  // Validate signature
  if (!validateXeroSignature(req)) {
    console.error("Webhook signature validation failed");
    return res.sendStatus(401);
  }

  // Acknowledge receipt immediately (Xero requires fast response)
  res.sendStatus(200);

  // Process events asynchronously
  const { events } = req.body;

  for (const event of events) {
    try {
      await handleXeroEvent(event);
    } catch (err) {
      console.error(`Error handling event ${event.eventType} for ${event.resourceId}:`, err.message);
    }
  }
});

/**
 * Route Xero invoice events to your business logic.
 * Extend this function to integrate with Slack, email, your own DB, etc.
 */
async function handleXeroEvent(event) {
  const { eventType, resourceType, resourceId, tenantId } = event;

  // We only care about invoice events
  if (resourceType !== "INVOICE") return;

  console.log(`Xero event: ${eventType} | Invoice: ${resourceId} | Tenant: ${tenantId}`);

  // Fetch the current state of the invoice from Xero
  const invoice = await getExpense(resourceId);
  const status = invoice.status;
  const reference = invoice.reference || "";

  switch (status) {
    case "SUBMITTED":
      await onExpenseSubmitted(invoice);
      break;

    case "AUTHORISED":
      await onExpenseApproved(invoice);
      break;

    case "DRAFT":
      // Check if this was a rejection (we stamp the reference field)
      if (reference.startsWith("REJECTED:")) {
        await onExpenseRejected(invoice);
      }
      break;

    case "PAID":
      await onExpensePaid(invoice);
      break;

    default:
      console.log(`Unhandled invoice status: ${status}`);
  }
}

// ---------------------------------------------------------------------------
// Event handlers — wire these up to your notification/approval system
// ---------------------------------------------------------------------------

async function onExpenseSubmitted(invoice) {
  console.log(`[SUBMITTED] Expense from ${invoice.contact?.name} for ${invoice.total} — awaiting approval`);

  // TODO: Send approval request email/Slack to manager
  // Example: await slackNotify(`New expense from ${invoice.contact.name}: £${invoice.total}. Approve at /expenses/${invoice.invoiceID}/approve`);
}

async function onExpenseApproved(invoice) {
  console.log(`[APPROVED] Invoice ${invoice.invoiceID} approved — ready for payment`);

  // TODO: Notify finance team to process payment
  // TODO: Notify employee their expense was approved
}

async function onExpenseRejected(invoice) {
  const reason = invoice.reference.replace("REJECTED: ", "");
  console.log(`[REJECTED] Invoice ${invoice.invoiceID} rejected. Reason: ${reason}`);

  // TODO: Notify employee their expense was rejected with reason
}

async function onExpensePaid(invoice) {
  console.log(`[PAID] Invoice ${invoice.invoiceID} paid — ${invoice.total}`);

  // TODO: Notify employee payment has been processed
}
