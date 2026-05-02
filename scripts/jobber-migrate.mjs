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
 * RUN (from repo root, logged into the Jobber account you want to export — or use JOBBER_ACCESS_TOKEN):
 *   node scripts/jobber-migrate.mjs
 *
 * The script will print an authorization URL. Open it in your browser,
 * click "Allow Access", and the migration will start automatically.
 */

import http from 'http';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

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

const JOBBER_CLIENT_ID     = env.JOBBER_CLIENT_ID;
const JOBBER_CLIENT_SECRET = env.JOBBER_CLIENT_SECRET;
const SUPABASE_URL         = env.SUPABASE_URL         || env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const REDIRECT_URI   = 'http://localhost:3456/callback';
const JOBBER_API_URL = 'https://api.getjobber.com/api/graphql';
const JOBBER_VERSION = '2025-04-16';

// ── Validate env ──────────────────────────────────────────────────────────────

const missing = [];
if (!JOBBER_CLIENT_ID)     missing.push('JOBBER_CLIENT_ID');
if (!JOBBER_CLIENT_SECRET) missing.push('JOBBER_CLIENT_SECRET');
if (!SUPABASE_URL)         missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

if (missing.length) {
  console.error('\n❌  Missing environment variables in .env.local:\n');
  missing.forEach(k => console.error(`   ${k}`));
  console.error('\nSee the setup instructions at the top of this file.\n');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/** Must match seed tenant in supabase/migrations/009_multi_tenancy.sql */
const TENANT_ID =
  env.DEFAULT_TENANT_ID?.trim() || 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b';

// ── OAuth helpers ─────────────────────────────────────────────────────────────

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const state = randomBytes(16).toString('hex');

    const authUrl =
      `https://api.getjobber.com/api/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(JOBBER_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}`;

    console.log('\n──────────────────────────────────────────────');
    console.log('  Open this URL in your browser to authorize:');
    console.log('──────────────────────────────────────────────');
    console.log(`\n  ${authUrl}\n`);
    console.log('Waiting for authorization...\n');

    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/callback')) return;

      const url    = new URL(req.url, 'http://localhost:3456');
      const code   = url.searchParams.get('code');
      const retState = url.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>✅ Authorized! You can close this tab.</h2><p>Return to your terminal to watch the migration.</p></body></html>');
      server.close();

      if (retState !== state) {
        reject(new Error('OAuth state mismatch — possible CSRF'));
        return;
      }

      if (!code) {
        reject(new Error('No authorization code received'));
        return;
      }

      // Exchange code for access token
      const tokenRes = await fetch('https://api.getjobber.com/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          client_id:     JOBBER_CLIENT_ID,
          client_secret: JOBBER_CLIENT_SECRET,
          redirect_uri:  REDIRECT_URI,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const txt = await tokenRes.text();
        reject(new Error(`Token exchange failed: ${tokenRes.status} ${txt}`));
        return;
      }

      const { access_token } = await tokenRes.json();
      resolve(access_token);
    });

    server.listen(3456, () => {});
    server.on('error', reject);
  });
}

// ── GraphQL helper ────────────────────────────────────────────────────────────

async function gql(token, query, variables = {}) {
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

  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Paginate through all nodes of a connection
async function paginate(token, query, getConnection, variables = {}) {
  const nodes = [];
  let cursor = null;

  do {
    const data = await gql(token, query, { ...variables, cursor });
    const conn = getConnection(data);
    nodes.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    process.stdout.write(`  fetched ${nodes.length}...\r`);
    if (cursor) await sleep(2000); // stay under Jobber's rate limit
  } while (cursor);

  return nodes;
}

// ── GraphQL queries ───────────────────────────────────────────────────────────

const CLIENTS_QUERY = `
  query GetClients($cursor: String) {
    clients(first: 25, after: $cursor) {
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
  query GetQuotes($cursor: String) {
    quotes(first: 25, after: $cursor) {
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
  query GetJobs($cursor: String) {
    jobs(first: 25, after: $cursor) {
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
  query GetInvoices($cursor: String) {
    invoices(first: 25, after: $cursor) {
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
  const accountRows = clients.map(mapClientToAccount);

  // Fetch already-imported jobber_ids so we can skip duplicates
  const { data: existingAccounts } = await sb.from('crm_accounts').select('id, jobber_id').not('jobber_id', 'is', null);
  const existingAccountIds = new Set((existingAccounts ?? []).map(a => a.jobber_id));
  const accountIdMap = {};
  (existingAccounts ?? []).forEach(a => { accountIdMap[a.jobber_id] = a.id; });

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
  const { data: existingProps } = await sb.from('crm_properties').select('id, jobber_id').not('jobber_id', 'is', null);
  const existingPropIds = new Set((existingProps ?? []).map(p => p.jobber_id));

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

  const { data: existingQuotes } = await sb.from('quotes').select('id, jobber_id').not('jobber_id', 'is', null);
  const existingQuoteIds = new Set((existingQuotes ?? []).map(q => q.jobber_id));
  const quoteIdMap = {};
  (existingQuotes ?? []).forEach(q => { quoteIdMap[q.jobber_id] = q.id; });

  const newQuoteRows = quoteRows.filter(r => !existingQuoteIds.has(r.jobber_id));
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

  const { data: existingJobs } = await sb.from('jobs').select('id, jobber_id').not('jobber_id', 'is', null);
  const existingJobIds = new Set((existingJobs ?? []).map(j => j.jobber_id));
  const jobIdMap = {};
  (existingJobs ?? []).forEach(j => { jobIdMap[j.jobber_id] = j.id; });

  const newJobRows = jobRows.filter(r => !existingJobIds.has(r.jobber_id));
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

  const { data: existingInvoices } = await sb.from('invoices').select('id, jobber_id').not('jobber_id', 'is', null);
  const existingInvoiceIds = new Set((existingInvoices ?? []).map(i => i.jobber_id));
  const invoiceIdMap = {};
  (existingInvoices ?? []).forEach(i => { invoiceIdMap[i.jobber_id] = i.id; });

  const newInvoiceRows = invoiceRows.filter(r => !existingInvoiceIds.has(r.jobber_id));
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

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  Island Hydroseeding — Jobber Migration\n');

  // 1. OAuth (skip if token already provided via env)
  const token = env.JOBBER_ACCESS_TOKEN ?? await getAccessToken();
  console.log('✅  Authorized!\n');

  // 2. Clients + properties (must run first — other records reference accounts)
  const accountIdMap = await migrateClients(token);

  // Build property jobber_id → supabase_id map for use by quotes/jobs/invoices
  const { data: allProps } = await sb
    .from('crm_properties')
    .select('id, jobber_id')
    .not('jobber_id', 'is', null);
  const propertyIdMap = {};
  (allProps ?? []).forEach(p => { propertyIdMap[p.jobber_id] = p.id; });

  // 3. Quotes
  const quoteIdMap = await migrateQuotes(token, accountIdMap, propertyIdMap);

  // 4. Jobs
  const jobIdMap = await migrateJobs(token, accountIdMap, propertyIdMap, quoteIdMap);

  // 5. Invoices
  await migrateInvoices(token, accountIdMap, propertyIdMap, jobIdMap);

  console.log('\n✅  Migration complete!\n');
}

main().catch(err => {
  console.error('\n❌  Migration failed:', err.message);
  process.exit(1);
});
