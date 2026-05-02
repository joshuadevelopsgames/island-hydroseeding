/**
 * Accounts v2: unified merchant + customer identity for a connected business (blueprint-aligned).
 * Enable with STRIPE_CONNECT_USE_ACCOUNTS_V2=true and STRIPE_API_VERSION set (Workbench preview).
 */

import { stripePreviewPost } from './_stripePreviewRequest';

export type CreateV2AccountParams = {
  displayName: string;
  contactEmail: string;
  tenantId: string;
  country: string;
};

type V2AccountResponse = { id: string };

export async function createUnifiedConnectedAccount(params: CreateV2AccountParams): Promise<V2AccountResponse> {
  const simulate = process.env.STRIPE_SIMULATE_CONNECTED_ONBOARDING === 'true';

  const body: Record<string, unknown> = {
    display_name: params.displayName.slice(0, 100) || 'Workspace',
    contact_email: params.contactEmail || undefined,
    metadata: { tenant_id: params.tenantId },
    dashboard: 'full',
    identity: {
      country: params.country,
      entity_type:
        process.env.STRIPE_CONNECTED_ACCOUNT_ENTITY_TYPE === 'company' ? 'company' : 'individual',
      business_details: {
        phone: process.env.STRIPE_CONNECTED_ACCOUNT_PLACEHOLDER_PHONE?.trim() || '+10000000000',
      },
    },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
        },
        ...(simulate ? { simulate_accept_tos_obo: true } : {}),
      },
      customer: {
        capabilities: {
          automatic_indirect_tax: { requested: true },
        },
      },
    },
    defaults: {
      currency: (process.env.STRIPE_CONNECTED_ACCOUNT_DEFAULT_CURRENCY ?? 'cad').toLowerCase(),
      responsibilities: {
        losses_collector: 'stripe',
        fees_collector: 'stripe',
      },
    },
    include: ['configuration.merchant', 'configuration.customer', 'identity', 'defaults', 'requirements'],
  };

  return stripePreviewPost<V2AccountResponse>('/v2/core/accounts', body);
}

export type CreateV2OnboardingLinkParams = {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
};

type V2AccountLinkResponse = { url: string; expires_at?: number };

export async function createOnboardingAccountLink(
  params: CreateV2OnboardingLinkParams
): Promise<V2AccountLinkResponse> {
  const body = {
    account: params.accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['merchant', 'customer'],
        return_url: params.returnUrl,
        refresh_url: params.refreshUrl,
      },
    },
  };

  return stripePreviewPost<V2AccountLinkResponse>('/v2/core/account_links', body);
}
