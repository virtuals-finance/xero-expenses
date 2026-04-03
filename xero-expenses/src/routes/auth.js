import { Router } from "express";
import { getXeroClient, saveTokenSet, saveTenantId } from "../xeroClient.js";

export const authRouter = Router();

/**
 * Step 1: Redirect user to Xero login
 * GET /auth/connect
 */
authRouter.get("/connect", async (req, res) => {
  try {
    const client = getXeroClient();
    const consentUrl = await client.buildConsentUrl();
    res.redirect(consentUrl);
  } catch (err) {
    res.status(500).json({ error: "Failed to build Xero consent URL", detail: err.message });
  }
});

/**
 * Step 2: Xero redirects back here with an auth code
 * GET /auth/callback
 */
authRouter.get("/callback", async (req, res) => {
  try {
    const client = getXeroClient();

    // Exchange auth code for token set
    const tokenSet = await client.apiCallback(req.url);
    saveTokenSet(tokenSet);

    // Fetch and store the active tenant (organisation)
    const tenants = await client.updateTenants();
    if (!tenants || tenants.length === 0) {
      return res.status(400).json({ error: "No Xero organisations found for this account." });
    }

    saveTenantId(tenants[0].tenantId);

    req.session.authenticated = true;

    res.json({
      message: "Successfully connected to Xero",
      organisation: tenants[0].tenantName,
      tenantId: tenants[0].tenantId,
    });
  } catch (err) {
    res.status(500).json({ error: "OAuth2 callback failed", detail: err.message });
  }
});

/**
 * GET /auth/status
 */
authRouter.get("/status", (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

/**
 * GET /auth/disconnect
 */
authRouter.get("/disconnect", async (req, res) => {
  try {
    const client = getXeroClient();
    await client.revokeToken();
  } catch (_) {
    // Best-effort revocation
  }
  req.session.destroy();
  res.json({ message: "Disconnected from Xero" });
});
