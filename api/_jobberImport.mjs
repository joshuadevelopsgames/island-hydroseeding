/**
 * Jobber → Supabase Migration Script
 * ====================================
 * Pulls all clients, quotes, jobs, and invoices from Jobber via GraphQL
 * and imports them into your Supabase database.
 *
 * SETUP (one-time):
 *   1. Go to https://developer.getjobber.com and create a free account
 *   2. Click "Create App" — give it any name (e.g. "Island Migration")
 *   3. Copy the Client ID and Client Secret (localhost is supported automatically,
 *      no redirect URI configuration needed)
 *   4. Add to your .env.local:
 *        JOBBER_CLIENT_ID=your_client_id
 *        JOBBER_CLIENT_SECRET=your_client_secret
 *        SUPABASE_URL=…
 *        SUPABASE_SERVICE_ROLE_KEY=…
 *        DEFAULT_TENANT_ID=a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b   (same as api/_tenant.ts / migration 009)
 *
 *   5. In Supabase SQL editor, run scripts/jobber-migration-prep.sql once (jobber_id columns).
 *
 * Optional tuning (rate limits / throttling):
 *   JOBBER_GRAPHQL_PAGE_SIZE=12     (default; lower = smaller API cost per page)
 *   JOBBER_PAGINATION_DELAY_MS=6000 (pause between pages; increase if THROTTLED)
 *   JOBBER_THROTTLE_RETRY_MAX=12    (retries with exponential backoff on THROTTLED)
 *
 * RUN (from repo root, logged into the Jobber account you want to export — or use JOBBER_ACCESS_TOKEN):
 *   node scripts/jobber-migrate.mjs
 *
 * The script will print an authorization URL. Open it in your browser,
 * click "Allow Access", and the migration will start automatically.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ── Load env ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      env[key] = val;
    }
  } catch { /* .env.local not found — fall through to process.env */ }
  return { ...process.env, ...env };
}

const env = loadEnv();

const SUPABASE_URL         = env.SUPABASE_URL         || env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const JOBBER_API_URL = 'https://api.getjobber.com/api/graphql';
const JOBBER_VERSION = '2025-04-16';

/** Smaller pages + longer pauses reduce GraphQL cost throttling (see Jobber rate limits) */
const JOBBER_GRAPHQL_PAGE_SIZE = Math.min(
  100,
  Math.max(1, Number.parseInt(env.JOBBER_GRAPHQL_PAGE_SIZE ?? '12', 10) || 12),
);
const JOBBER_PAGINATION_DELAY_MS = Math.max(
  500,
  Number.parseInt(env.JOBBER_PAGINATION_DELAY_MS ?? '6000', 10) || 6000,
);
const JOBBER_THROTTLE_RETRY_MAX = Math.max(
  1,
  Number.parseInt(env.JOBBER_THROTTLE_RETRY_MAX ?? '12', 10) || 12,
);

// ── Validate env ──────────────────────────────────────────────────────────────

const missing = [];
if (!SUPABASE_URL)         missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

if (missing.length) {
  console.error('\n❌  Missing environment variables in .env.local:\n');
  missing.forEach(k => console.error(`   ${k}`));
  console.error('\nSee the setup instructions at the top of this file.\n');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/** PostgREST returns at most ~1000 rows per request; paginate for dedup lookups */
const JOBBER_PAGE = 1000;

async function selectAllIdJobber(table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('id, jobber_id')
      .not('jobber_id', 'is', null)
      .range(from, from + JOBBER_PAGE - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < JOBBER_PAGE) break;
    from += JOBBER_PAGE;
  }
  return rows;
}

function dedupeRowsByJobberId(rows) {
  const m = new Map();
  for (const r of rows) {
    if (r.jobber_id != null) m.set(r.jobber_id, r);
  }
  return [...m.values()];
}

/** Must match seed tenant in supabase/migrations/009_multi_tenancy.sql */
const TENANT_ID =
  env.DEFAULT_TENANT_ID?.trim() || 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b';

// ── GraphQL helper ────────────────────────────────────────────────────────────

async function gql(token, query, variables = {}) {
  let attempt = 0;
  for (;;) {
    const res = await fetch(JOBBER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization':          `Bearer ${token}`,
        'Content-Type':           'application/json',
        'X-JOBBER-GRAPHQL-VERSION': JOBBER_VERSION,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      throw new Error(`Jobber API error: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();

    const throttled =
      json.errors?.some(
        e =>
          e.extensions?.code === 'THROTTLED' ||
          /throttl/i.test(String(e.message ?? '')),
      );

    if (throttled && attempt < JOBBER_THROTTLE_RETRY_MAX) {
      const waitMs = Math.min(120_000, 5000 * 2 ** attempt);
      console.warn(
        `\n  Jobber throttled — waiting ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${JOBBER_THROTTLE_RETRY_MAX})...\n`,
      );
      await sleep(waitMs);
      attempt++;
      continue;
    }

    if (json.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Paginate through all nodes of a connection
async function paginate(token, query, getConnection, variables = {}) {
  const nodes = [];
  let cursor = null;
  const first = JOBBER_GRAPHQL_PAGE_SIZE;

  do {
    const data = await gql(token, query, { ...variables, first, cursor });
    const conn = getConnection(data);
    nodes.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    process.stdout.write(`  fetched ${nodes.length}...\r`);
    if (cursor) await sleep(JOBBER_PAGINATION_DELAY_MS);
  } while (cursor);

  return nodes;
}

// ── GraphQL queries ───────────────────────────────────────────────────────────

const CLIENTS_QUERY = `
  query GetClients($first: Int!, $cursor: String) {
    clients(first: $first, after: $cursor) {
      nodes {
        id
        firstName
        lastName
        companyName
        isCompany
        emails { address primary }
        phones { number primary }
        billingAddress {
          street1
          street2
          city
          province
          postalCode
          country
        }
        properties {
          id
          address {
            street1
            street2
            city
            province
            postalCode
            country
          }
        }
        createdAt
        updatedAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const QUOTES_QUERY = `
  query GetQuotes($first: Int!, $cursor: String) {
    quotes(first: $first, after: $cursor) {
      nodes {
        id
        quoteNumber
        title
        quoteStatus
        message
        createdAt
        updatedAt
        transitionedAt
        clientHubViewedAt
        client { id }
        property { id }
        amounts {
          subtotal
          total
          depositAmount
          taxAmount
        }
        lineItems {
          nodes {
            id
            name
            description
            quantity
            unitPrice
            totalPrice
            sortOrder
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const JOBS_QUERY = `
  query GetJobs($first: Int!, $cursor: String) {
    jobs(first: $first, after: $cursor) {
      nodes {
        id
        jobNumber
        title
        jobStatus
        startAt
        endAt
        createdAt
        updatedAt
        total
        client { id }
        property { id }
        lineItems {
          nodes {
            id
            name
            description
            quantity
            unitPrice
            totalPrice
            sortOrder
          }
        }
        visits {
          nodes {
            id
            startAt
            endAt
            isComplete
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const INVOICES_QUERY = `
  query GetInvoices($first: Int!, $cursor: String) {
    invoices(first: $first, after: $cursor) {
      nodes {
        id
        invoiceNumber
        subject
        invoiceStatus
        issuedDate
        dueDate
        createdAt
        updatedAt
        client { id }
        properties(first: 1) {
          nodes { id }
        }
        amounts {
          subtotal
          total
          taxAmount
          paymentsTotal
          outstandingBalance
        }
        lineItems {
          nodes {
            id
            name
            description
            quantity
            unitPrice
            totalPrice
            sortOrder
          }
        }
        paymentRecords(first: 100) {
          nodes {
            id
            amount
            recordedDate
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// ── Mappers ───────────────────────────────────────────────────────────────────

/** Jobber returns Float or Money objects depending on field / version */
function moneyVal(x) {
  if (x == null || x === '') return 0;
  if (typeof x === 'number' && !Number.isNaN(x)) return x;
  if (typeof x === 'object' && x.value != null) return parseFloat(x.value) || 0;
  return parseFloat(x) || 0;
}

function mapClientToAccount(c) {
  const primaryEmail = c.emails?.find(e => e.primary)?.address ?? c.emails?.[0]?.address ?? null;
  const primaryPhone = c.phones?.find(p => p.primary)?.number ?? c.phones?.[0]?.number ?? null;
  const addr = c.billingAddress;
  const addressStr = [addr?.street1, addr?.street2].filter(Boolean).join(', ') || null;

  return {
    name:           c.isCompany
                      ? (c.companyName || `${c.firstName} ${c.lastName}`.trim())
                      : `${c.firstName} ${c.lastName}`.trim(),
    company:        c.isCompany ? c.companyName : null,
    account_type:   c.isCompany ? 'Commercial' : 'Residential',
    status:         'Active',
    email:          primaryEmail,
    phone:          primaryPhone,
    address:        addressStr,
    created_at:     c.createdAt ?? new Date().toISOString(),
    updated_at:     c.updatedAt ?? new Date().toISOString(),
    jobber_id:      c.id,
    tenant_id:      TENANT_ID,
  };
}

function mapProperty(prop, accountId) {
  const a = prop.address ?? {};
  return {
    account_id:  accountId,
    address:     [a.street1, a.street2].filter(Boolean).join(', ') || 'Unknown',
    city:        a.city ?? null,
    province:    a.province ?? 'British Columbia',
    postal_code: a.postalCode ?? null,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
    jobber_id:   prop.id,
    tenant_id:   TENANT_ID,
  };
}

function mapLineItem(li, parentKey, parentId, index) {
  return {
    [parentKey]:          parentId,
    tenant_id:            TENANT_ID,
    product_service_name: li.name || 'Service',
    description:          li.description ?? null,
    quantity:             parseFloat(li.quantity) || 1,
    unit_price:           parseFloat(li.unitPrice) || 0,
    total:                parseFloat(li.totalPrice) || 0,
    sort_order:           li.sortOrder ?? index,
    created_at:           new Date().toISOString(),
  };
}

function mapQuoteStatus(s) {
  const map = {
    draft:              'Draft',
    sent:               'Sent',
    awaiting_response:  'Awaiting Response',
    changes_requested:  'Changes Requested',
    approved:           'Approved',
    converted:          'Converted',
    archived:           'Archived',
  };
  const snake = String(s ?? '')
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
  return map[snake] ?? 'Draft';
}

function mapJobStatus(s) {
  const map = {
    active:             'Active',
    late:               'Late',
    requires_invoicing: 'Requires Invoicing',
    completed:          'Completed',
    archived:           'Archived',
  };
  return map[s?.toLowerCase()] ?? 'Active';
}

function mapInvoiceStatus(s) {
  const map = {
    draft:              'Draft',
    sent:               'Sent',
    awaiting_payment:   'Sent',
    past_due:           'Past Due',
    paid:               'Paid',
    bad_debt:           'Archived',
  };
  const snake = String(s ?? '')
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
  return map[snake] ?? 'Draft';
}

// ── Supabase upsert helpers ───────────────────────────────────────────────────

async function upsert(table, rows, onConflict = null) {
  if (!rows.length) return [];
  const opts = onConflict ? { onConflict } : {};
  const { data, error } = await sb.from(table).upsert(rows, { ...opts, returning: 'representation' });
  if (error) throw new Error(`Supabase [${table}]: ${error.message}`);
  return data ?? [];
}

// ── Migration steps ───────────────────────────────────────────────────────────

async function migrateClients(token) {
  console.log('\n📋  Fetching clients...');
  const clients = await paginate(token, CLIENTS_QUERY, d => d.clients);
  console.log(`  ✓ ${clients.length} clients`);

  // Check if jobber_id column exists on crm_accounts; if not, add it temporarily via a map
  const accountRows = dedupeRowsByJobberId(clients.map(mapClientToAccount));

  // Fetch already-imported jobber_ids so we can skip duplicates (paginate — default limit is ~1000)
  const existingAccounts = await selectAllIdJobber('crm_accounts');
  const existingAccountIds = new Set(existingAccounts.map(a => a.jobber_id));
  const accountIdMap = {};
  existingAccounts.forEach(a => { accountIdMap[a.jobber_id] = a.id; });

  const newAccountRows = accountRows.filter(r => !existingAccountIds.has(r.jobber_id));

  if (newAccountRows.length) {
    const { data: inserted, error: accErr } = await sb
      .from('crm_accounts')
      .insert(newAccountRows)
      .select('id, jobber_id');
    if (accErr) throw new Error(`crm_accounts: ${accErr.message}`);
    (inserted ?? []).forEach(a => { accountIdMap[a.jobber_id] = a.id; });
  }

  // Properties
  const existingProps = await selectAllIdJobber('crm_properties');
  const existingPropIds = new Set(existingProps.map(p => p.jobber_id));

  const propRows = [];
  for (const c of clients) {
    const accountId = accountIdMap[c.id];
    if (!accountId) continue;
    if (c.properties?.id && !existingPropIds.has(c.properties.id)) {
      propRows.push(mapProperty(c.properties, accountId));
    }
  }

  if (propRows.length) {
    const { error: propErr } = await sb.from('crm_properties').insert(propRows);
    if (propErr) throw new Error(`crm_properties: ${propErr.message}`);
  }

  console.log(`  ✓ ${newAccountRows.length} new accounts, ${propRows.length} new properties inserted (${existingAccountIds.size} already existed)`);
  return accountIdMap;
}

async function migrateQuotes(token, accountIdMap, propertyIdMap) {
  console.log('\n📝  Fetching quotes...');
  const quotes = await paginate(token, QUOTES_QUERY, d => d.quotes);
  console.log(`  ✓ ${quotes.length} quotes`);

  const quoteRows = [];
  for (const q of quotes) {
    const account_id = accountIdMap[q.client?.id];
    if (!account_id) {
      console.warn(`  ⚠ Skipping quote (no client in map): ${q.title || q.quoteNumber || q.id}`);
      continue;
    }
    const statusLabel = mapQuoteStatus(q.quoteStatus);
    const transition = q.transitionedAt ?? null;
    quoteRows.push({
      tenant_id:        TENANT_ID,
      account_id,
      property_id:      propertyIdMap[q.property?.id] ?? null,
      title:            q.title || `Quote #${q.quoteNumber}`,
      status:           statusLabel,
      introduction:     q.message ?? null,
      subtotal:         moneyVal(q.amounts?.subtotal),
      tax_amount:       moneyVal(q.amounts?.taxAmount),
      total:            moneyVal(q.amounts?.total),
      deposit_required: moneyVal(q.amounts?.depositAmount) > 0,
      deposit_amount:   moneyVal(q.amounts?.depositAmount) || null,
      created_at:       q.createdAt ?? new Date().toISOString(),
      updated_at:       q.updatedAt ?? new Date().toISOString(),
      sent_at:          transition,
      approved_at:
        statusLabel === 'Approved' || statusLabel === 'Converted' ? transition : null,
      jobber_id:        q.id,
    });
  }

  const existingQuotes = await selectAllIdJobber('quotes');
  const existingQuoteIds = new Set(existingQuotes.map(q => q.jobber_id));
  const quoteIdMap = {};
  existingQuotes.forEach(q => { quoteIdMap[q.jobber_id] = q.id; });

  const newQuoteRows = dedupeRowsByJobberId(quoteRows).filter(r => !existingQuoteIds.has(r.jobber_id));
  if (newQuoteRows.length) {
    const { data: inserted, error: quoteErr } = await sb.from('quotes').insert(newQuoteRows).select('id, jobber_id');
    if (quoteErr) throw new Error(`quotes: ${quoteErr.message}`);
    (inserted ?? []).forEach(q => { quoteIdMap[q.jobber_id] = q.id; });
  }

  // Line items (only for newly inserted quotes)
  const lineItemRows = [];
  for (const q of quotes) {
    const quoteId = quoteIdMap[q.id];
    if (!quoteId || existingQuoteIds.has(q.id)) continue;
    (q.lineItems?.nodes ?? []).forEach((li, i) => {
      lineItemRows.push(mapLineItem(li, 'quote_id', quoteId, i));
    });
  }

  if (lineItemRows.length) {
    const { error: liErr } = await sb.from('quote_line_items').insert(lineItemRows);
    if (liErr) throw new Error(`quote_line_items: ${liErr.message}`);
  }

  console.log(`  ✓ ${newQuoteRows.length} new quotes, ${lineItemRows.length} line items inserted (${existingQuoteIds.size} already existed)`);
  return quoteIdMap;
}

async function migrateJobs(token, accountIdMap, propertyIdMap, quoteIdMap) {
  console.log('\n🔨  Fetching jobs...');
  const jobs = await paginate(token, JOBS_QUERY, d => d.jobs);
  console.log(`  ✓ ${jobs.length} jobs`);

  const jobRows = [];
  for (const j of jobs) {
    const account_id = accountIdMap[j.client?.id];
    if (!account_id) {
      console.warn(`  ⚠ Skipping job (no client in map): ${j.title || j.jobNumber || j.id}`);
      continue;
    }
    jobRows.push({
      tenant_id:   TENANT_ID,
      account_id,
      property_id: propertyIdMap[j.property?.id] ?? null,
      title:       j.title || `Job #${j.jobNumber}`,
      job_type:    'One-off',
      status:      mapJobStatus(j.jobStatus),
      total_price: moneyVal(j.total),
      start_date:  j.startAt ? j.startAt.slice(0, 10) : null,
      end_date:    j.endAt ? j.endAt.slice(0, 10) : null,
      created_at:  j.createdAt ?? new Date().toISOString(),
      updated_at:  j.updatedAt ?? new Date().toISOString(),
      jobber_id:   j.id,
    });
  }

  const existingJobs = await selectAllIdJobber('jobs');
  const existingJobIds = new Set(existingJobs.map(j => j.jobber_id));
  const jobIdMap = {};
  existingJobs.forEach(j => { jobIdMap[j.jobber_id] = j.id; });

  const newJobRows = dedupeRowsByJobberId(jobRows).filter(r => !existingJobIds.has(r.jobber_id));
  if (newJobRows.length) {
    const { data: inserted, error: jobErr } = await sb.from('jobs').insert(newJobRows).select('id, jobber_id');
    if (jobErr) throw new Error(`jobs: ${jobErr.message}`);
    (inserted ?? []).forEach(j => { jobIdMap[j.jobber_id] = j.id; });
  }

  const lineItemRows = [];
  const visitRows    = [];

  for (const j of jobs) {
    const jobId = jobIdMap[j.id];
    if (!jobId || existingJobIds.has(j.id)) continue;

    (j.lineItems?.nodes ?? []).forEach((li, i) => {
      lineItemRows.push(mapLineItem(li, 'job_id', jobId, i));
    });

    (j.visits?.nodes ?? []).forEach(v => {
      visitRows.push({
        tenant_id:    TENANT_ID,
        job_id:       jobId,
        scheduled_at: v.startAt ?? j.startAt ?? new Date().toISOString(),
        completed_at: v.isComplete ? (v.endAt ?? null) : null,
        status:       v.isComplete ? 'Completed' : 'Scheduled',
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      });
    });
  }

  if (lineItemRows.length) {
    const { error: liErr } = await sb.from('job_line_items').insert(lineItemRows);
    if (liErr) throw new Error(`job_line_items: ${liErr.message}`);
  }

  if (visitRows.length) {
    const { error: vErr } = await sb.from('job_visits').insert(visitRows);
    if (vErr) throw new Error(`job_visits: ${vErr.message}`);
  }

  console.log(`  ✓ ${newJobRows.length} new jobs, ${lineItemRows.length} line items, ${visitRows.length} visits inserted (${existingJobIds.size} already existed)`);
  return jobIdMap;
}

async function migrateInvoices(token, accountIdMap, propertyIdMap, jobIdMap) {
  console.log('\n🧾  Fetching invoices...');
  const invoices = await paginate(token, INVOICES_QUERY, d => d.invoices);
  console.log(`  ✓ ${invoices.length} invoices`);

  const invoiceRows = invoices.map(inv => {
    const propId = inv.properties?.nodes?.[0]?.id;
    return {
      tenant_id:   TENANT_ID,
      account_id:  accountIdMap[inv.client?.id] ?? null,
      property_id: propertyIdMap[propId] ?? null,
      title:       inv.subject ?? null,
      status:      mapInvoiceStatus(inv.invoiceStatus),
      issue_date:  inv.issuedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      due_date:    inv.dueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      subtotal:    moneyVal(inv.amounts?.subtotal),
      tax_amount:  moneyVal(inv.amounts?.taxAmount),
      total:       moneyVal(inv.amounts?.total),
      amount_paid: moneyVal(inv.amounts?.paymentsTotal),
      balance_due: moneyVal(inv.amounts?.outstandingBalance),
      created_at:  inv.createdAt ?? new Date().toISOString(),
      updated_at:  inv.updatedAt ?? new Date().toISOString(),
      jobber_id:   inv.id,
    };
  });

  const existingInvoices = await selectAllIdJobber('invoices');
  const existingInvoiceIds = new Set(existingInvoices.map(i => i.jobber_id));
  const invoiceIdMap = {};
  existingInvoices.forEach(i => { invoiceIdMap[i.jobber_id] = i.id; });

  const newInvoiceRows = dedupeRowsByJobberId(invoiceRows).filter(r => !existingInvoiceIds.has(r.jobber_id));
  if (newInvoiceRows.length) {
    const { data: inserted, error: invErr } = await sb.from('invoices').insert(newInvoiceRows).select('id, jobber_id');
    if (invErr) throw new Error(`invoices: ${invErr.message}`);
    (inserted ?? []).forEach(i => { invoiceIdMap[i.jobber_id] = i.id; });
  }

  const lineItemRows = [];
  const paymentRows  = [];

  for (const inv of invoices) {
    const invoiceId = invoiceIdMap[inv.id];
    if (!invoiceId || existingInvoiceIds.has(inv.id)) continue;

    (inv.lineItems?.nodes ?? []).forEach((li, i) => {
      lineItemRows.push(mapLineItem(li, 'invoice_id', invoiceId, i));
    });

    (inv.paymentRecords?.nodes ?? []).forEach(p => {
      const payDate =
        p.recordedDate?.slice(0, 10) ??
        inv.issuedDate?.slice(0, 10) ??
        new Date().toISOString().slice(0, 10);
      paymentRows.push({
        tenant_id:        TENANT_ID,
        invoice_id:       invoiceId,
        amount:           moneyVal(p.amount),
        payment_method:   null,
        payment_date:     payDate,
        reference_number: null,
        created_at:       new Date().toISOString(),
      });
    });
  }

  if (lineItemRows.length) {
    const { error: liErr } = await sb.from('invoice_line_items').insert(lineItemRows);
    if (liErr) throw new Error(`invoice_line_items: ${liErr.message}`);
  }

  if (paymentRows.length) {
    const { error: pErr } = await sb.from('invoice_payments').insert(paymentRows);
    if (pErr) throw new Error(`invoice_payments: ${pErr.message}`);
  }

  console.log(`  ✓ ${newInvoiceRows.length} new invoices, ${lineItemRows.length} line items, ${paymentRows.length} payments inserted (${existingInvoiceIds.size} already existed)`);
}

// ── Exported runner (CLI + Vercel cron) ─────────────────────────────────────

export async function runJobberImport(accessToken) {
  console.log('\n🌱  Island Hydroseeding — Jobber import\n');

  const token = accessToken;
  console.log('✅  Authorized!\n');

  const accountIdMap = await migrateClients(token);

  const allProps = await selectAllIdJobber('crm_properties');
  const propertyIdMap = {};
  allProps.forEach(p => { propertyIdMap[p.jobber_id] = p.id; });

  const quoteIdMap = await migrateQuotes(token, accountIdMap, propertyIdMap);
  const jobIdMap = await migrateJobs(token, accountIdMap, propertyIdMap, quoteIdMap);
  await migrateInvoices(token, accountIdMap, propertyIdMap, jobIdMap);

  console.log('\n✅  Import complete!\n');
}
