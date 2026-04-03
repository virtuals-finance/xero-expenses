import { XeroClient } from "xero-node";

// Singleton Xero client
let xeroClient = null;
let tokenStore = {}; // In production, persist this to a DB

export function getXeroClient() {
  if (!xeroClient) {
    xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: [
        "openid",
        "profile",
        "email",
        "accounting.transactions",
        "accounting.contacts",
        "accounting.attachments",
        "offline_access",
      ],
    });
  }
  return xeroClient;
}

/**
 * Returns an authenticated Xero client, refreshing the token if needed.
 */
export async function getAuthenticatedClient() {
  const client = getXeroClient();

  if (!tokenStore.tokenSet) {
    throw new Error("Not authenticated. Complete OAuth2 flow first via /auth/connect");
  }

  // Restore token set into client
  await client.setTokenSet(tokenStore.tokenSet);

  // Refresh if expired (xero-node handles this automatically)
  if (client.readTokenSet().expired()) {
    const refreshed = await client.refreshToken();
    tokenStore.tokenSet = refreshed;
  }

  // Set the active tenant
  if (!tokenStore.tenantId) {
    const tenants = await client.updateTenants();
    tokenStore.tenantId = tenants[0].tenantId;
  }

  return { client, tenantId: tokenStore.tenantId };
}

export function saveTokenSet(tokenSet) {
  tokenStore.tokenSet = tokenSet;
}

export function saveTenantId(tenantId) {
  tokenStore.tenantId = tenantId;
}

export function getTokenStore() {
  return tokenStore;
}
