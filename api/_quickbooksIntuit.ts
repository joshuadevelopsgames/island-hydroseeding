/** Intuit OAuth / API endpoints (QuickBooks Online) */
export const INTUIT_AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
export const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
/** Matches token endpoint host; see Intuit OAuth 2.0 docs */
export const INTUIT_REVOKE_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/revoke';

/** Default: read/write accounting API */
export const QBO_SCOPE = 'com.intuit.quickbooks.accounting';
