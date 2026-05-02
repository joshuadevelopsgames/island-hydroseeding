# Jobber vs. Island Hydroseeding app — feature gap audit

Tour conducted 2026-05-02 by clicking through the live `secure.getjobber.com` account (Island Hydroseeding Ltd., 1,192 clients, 212 quotes, 100 jobs, 97 invoices). Compared against pages in `src/pages/` and the nav defined in `src/components/Layout.tsx`.

## Side-by-side nav

| Jobber | Island app | Status |
| --- | --- | --- |
| Home | Dashboard | ≈ parity |
| Schedule | Schedule | ≈ parity |
| Clients | Accounts (CRM) | partial — see gaps |
| Requests | Requests | ≈ parity |
| Quotes | Quotes / QuoteTemplates | partial |
| Jobs | Jobs | partial |
| Invoices | Invoices | ≈ parity |
| Payments | Payments | partial |
| Marketing → Reviews/Campaigns/Referrals/Website | — | **missing** |
| Receptionist (AI) | — | **missing** |
| Pipeline | — | **missing** |
| Insights → Reports | Dashboard (lightweight) | **missing depth** |
| Expenses | — (Fuel covers fuel only) | **missing** |
| Timesheets | Time Tracking | partial |
| Apps marketplace | — | **missing** |
| — | Pre-trips, FLHA, Fleet (Assets/Issues/Fuel/Maintenance/Inventory), Documents, Tasks | **app advantage** |

## Things Jobber has that the app does not

### Sales & lead management
- **Pipeline (Kanban)** — drag requests/quotes through stages: `New → Qualified → Assessment completed → Quote sent → Follow up`. Replaces the assumption that a flat list is enough.
- **Lead source** field on clients, plus a "Revenue by lead source" report and "Lead source" tag in client list.
- **Conversion rate** metric on Requests and Quotes pages (past 30 days, with delta).
- **Salesperson performance** report (conversion per salesperson).
- **Client re-engagement** report — clients with no closed job in 12 months.

### Client model
- **Multiple properties per client** — Stone Pacific has 10 service addresses under one client record. Each property has its own quotes/jobs/invoices but rolls up to one "Lifetime value" / "Current balance".
- **Multiple contacts per client** (named contacts beyond the primary).
- **Lifetime value & current balance** card on every client header.
- **Tags + status (Lead/Active) + lead source** as first-class filterable fields.
- **Client schedule / auto-reminders** — auto "Reminder for Quote #99 — sent on Nov 17, but no job has been generated" tasks appear automatically.

### Quotes
- **Quote sections** as composable blocks: Introduction, Product/Service, Attachments, Images, Reviews, Client message, Contract/Disclaimer.
- **Send via SMS** ("Send Text" button) in addition to email.
- **Deposit / payment-method-on-file requirement** toggle per quote.
- **Reviews block** — embed past Google reviews directly into the quote PDF.

### Jobs
- **Profitability panel** on every job: `Total price − Line Item Cost − Labor − Expenses = Profit`, with margin %.
- **Per-job time tracking** that flows into payroll.
- **Per-job expense tracking** with receipt PDF attachments, marked reimbursable → flows into "Confirm Payroll".
- **Recurring vs one-off** as a first-class job type, with a Recurring vs One-off donut on Insights.
- **Visit checklists** (e.g. "Post Job Checklist") attached to scheduled visits.
- **Linked-quote pointer** ("From Quote #123") on the job header.

### Invoices & payments
- **Residential vs Commercial split** on payment timing metrics (e.g. "Invoice payment time: 2 days residential, 0 days commercial").
- **Aged receivables** (30/60/90+) and **Bad debt** reports.
- **Projected income** (income from invoices awaiting payment).
- **Disputes / chargeback** management screen inside Payments.
- **Payouts** tab with payout schedule and **Instant Payouts** (debit-card option).
- **Payment methods on file** — request/store card, used for automatic collection.
- **Tax groups + multiple tax rates** with internal-only tax descriptions.
- **Client balance summary** report (NEW in Jobber).

### Marketing Suite (paid add-on, but worth noting)
- **Reviews automation** — auto-text every closed-job client a Google review link.
- **Email Campaigns** — re-engagement / upsell / announcement blasts with open/click/job-revenue tracking.
- **Referral program** — unique per-client referral codes with auto-rewards.
- **Hosted website builder** (`<tenant>.jobbersites.com`) with drag-and-drop sections, brand colors, and an embedded chat/booking widget.

### AI Receptionist (paid add-on)
- AI agent that answers **inbound phone calls, SMS, and website chat** and creates Jobs/Requests/Tasks automatically. Logs every conversation. Tracks "Time Saved" and "Workflows Created".
- Already enabled for the Island Hydroseeding website chat.

### Communication
- **Client communications log** — central report of every email and SMS Jobber sent on the user's behalf.
- **Job follow-up emails** report.
- **Dedicated phone number** (Jobber-issued) that forwards to the user, so SMS/calls can be tracked.
- **Client Hub** — client-facing portal where customers log in to view quotes, approve them, see invoices, pay online, view their job history.
- **"Send Text"** as a first-class action on quotes, invoices, and visit reminders.

### Operations
- **Automations** (in Settings) — workflow rules engine (event → action).
- **Custom Fields** — configurable extra fields on clients/properties/jobs/quotes/invoices.
- **Route Optimization** — visit ordering for crews.
- **Location Services / Waypoints** — GPS waypoint logging for crews, with a "Waypoints report" listing all logged points.
- **Online booking / Request forms** — public website embed that creates a Request directly.

### Reporting (Insights → Reports)
Massive prebuilt report library the app does not currently expose:

- **Financial:** Projected income, Transaction list, Invoices, Taxation, Aged receivables, Bad debt, Client balance summary
- **Work:** Visits, One-off jobs, Recurring jobs, Requests, Checklists, Quotes, Team productivity, Salesperson performance, Products & Services, Waypoints, Timesheets
- **Client:** Clients (with lead-channel breakdown), Lead source, Client communications, Job follow-up emails, Client contact info, Property list, Client re-engagement
- **Expense:** Expenses report
- **Jobber Payments:** Transactions

### Integrations / extensibility
- **Apps marketplace** with categories: GPS & Fleet Tracking, Inventory Mgmt, Payroll & HR, Photos & Cloud Storage, Reviews & Referrals, Sales & Marketing, Supplier Catalogs & Purchasing, Virtual Receptionists, etc. Connected on this account: QuickBooks Online, Jobber Payments, Island Migration (custom).
- **QuickBooks Online sync** for clients, invoices, payments (eliminates double-entry).
- **Zapier** as a featured app.
- **DocuSign** for digital signatures.
- **CompanyCam** for job photos.
- **FleetSharp** for GPS.
- **NiceJob** for review automation.

### UX niceties
- **Global "/" search** — single search box hits clients, jobs, invoices, quotes, etc.
- **Workflow strip** on Home — Requests / Quotes / Jobs / Invoices counts with sub-counters (Draft, Awaiting response, Past due, etc.).
- **Today's appointments** card on Home.
- **Business Performance / Receivables** card on Home with top debtors.
- **Yearly revenue overlay** on Insights (current year vs prior year on the same chart).
- **Trial / "save up to 30%"** promo strip — irrelevant to us, but the upsell pattern is everywhere.

## Things the Island app has that Jobber does not

These are the differentiators worth keeping/strengthening:

- **Pre-trips** (DOT-style vehicle pre-trip inspection)
- **FLHA** (Field Level Hazard Assessment) — none of Jobber's safety features go here
- **Fleet Issues** — vehicle defect reporting
- **Fuel & road** — fuel and road-tax tracking
- **Maintenance** (per-piece-of-equipment service history)
- **Inventory** (catalogs + dedupe)
- **Documents** folder browser with photo/folder management
- **Tasks (To-Do)** as a proper standalone module (Jobber's tasks are buried in Receptionist outputs)
- **Offline-first** mutation queue + offline banner (Jobber is online-only)
- **Multi-tenant workspace bootstrap** (`fleetWorkspace.ts`, `017_fleet_workspace.sql`)

## High-leverage gaps to consider closing

If we wanted to "match Jobber where it matters" without rebuilding the marketing suite, these are the ones with the biggest payoff for a service business:

1. **Multi-property per client** (currently one address per CRM account — see Stone Pacific with 10 service sites in Jobber). This is the single most painful difference.
2. **Profitability panel on jobs** (Total − Cost − Labor − Expenses = Profit, %). Cost data is mostly already there.
3. **Pipeline kanban** view across Requests + Quotes (one new screen, reuses existing data).
4. **Client lifetime value / current balance** on the CRM detail header.
5. **Reports library** — at minimum: Aged receivables, Projected income, Lead source, Client re-engagement, Salesperson performance, Products & Services usage.
6. **Per-job expense tracking** with receipt attachments.
7. **Quote section blocks** (Attachments / Images / Reviews / Client message / Contract) — currently the templates are a single doc.
8. **Send-quote-via-SMS** + payment-method-on-file deposit gating.
9. **Custom Fields** on clients/jobs/quotes (Jobber has them in settings).
10. **Conversion rate / time-to-close** metrics on Requests, Quotes, and the dashboard.
11. **Client communications log** — every email/SMS we sent, viewable per-client.
12. **Client Hub** — a tenant-branded customer-facing portal with quote-approve and pay-online (the app already has invoice-pay; this would extend it).

Lower-priority because they're either marketing-suite revenue-share stuff or genuine integrations:

- AI Receptionist (third-party vendor territory)
- Hosted website builder (we already have an external site)
- Email campaigns (use Mailchimp/Loops if needed)
- Apps marketplace (just keep building real integrations: QBO sync would matter)
