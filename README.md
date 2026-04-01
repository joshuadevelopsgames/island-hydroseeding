# Island Hydroseeding — internal web app

React (Vite) PWA for day-to-day operations. Shared data syncs through **Supabase** using a **Vercel** serverless API (service role key stays on the server).

## GitHub

From this folder after the first commit:

```bash
gh repo create island-hydroseeding --private --source=. --push
```

Or create an empty repository in the GitHub UI, then:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## Supabase (free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL → New query**, paste and run `supabase/migrations/001_app_workspace.sql`, then `supabase/migrations/002_crm_and_ops.sql` (CRM tables, announcements, approvals).
3. Copy **Project URL** and **service_role** key (**Settings → API**). Use them only on the server.

Do not put the service role key in `VITE_*` variables or commit it.

## Vercel

1. Push the repo to GitHub, then **Import** the repository in [Vercel](https://vercel.com).
2. Framework: Vite (or “Other”) — build `npm run build`, output `dist` (matches `vercel.json`).
3. **Environment variables** (Production + Preview):

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Optional: `CRON_SECRET` — if set, `/api/cron/ops` requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron forwards this when configured).

4. Deploy. The app calls `/api/workspace` for the shared workspace blob, `/api/crm` for relational CRM (accounts, contacts, interactions, research notes), and `/api/ops` for announcements and approval workflows.

Local **`npm run dev`** does not run Vercel functions; sync is skipped until you use **`vercel dev`** or deploy.

## Per-device data

`currentUserId` and time-tracker last-employee selection stay in the browser only and are not synced.

## CRM (accounts)

- List: **Leads & CRM** → accounts; open an account for contacts, interaction timeline, and research notes.
- Legacy **localStorage** leads (`crmLeads`) are imported once into Supabase when you first open the CRM page after deploy.
- **CSV**: export from the accounts toolbar; import expects a header row (`name`, `company`, `account_type`, `status`, …).

## Mobile (Capacitor)

After `npm run build`, run `npm run cap:sync` (or `npm run build:mobile`). Open native projects with `npm run cap:ios` / `npm run cap:android`. Point production builds at your deployed origin in `capacitor.config.ts` if needed (`server.url`).
