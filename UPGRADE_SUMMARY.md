# Island Hydroseeding — CRM + Mobile Upgrade Summary

**Date:** March 31, 2026  
**Scope:** Added LECRM-inspired features (accounts, contacts, interactions, research notes), React Query, Tailwind v4, shadcn/ui, Capacitor mobile support, ops endpoints (announcements, approvals), and MorphingPlusX animation.

---

## ✅ Completed

### 1. **Supabase Migration 002 — CRM + Ops Tables**

**File:** `supabase/migrations/002_crm_and_ops.sql`

Created relational tables for CRM and lightweight ops:

- **`crm_accounts`** — Companies/properties with type, status, marketing source, contact info
- **`crm_contacts`** — People tied to accounts (name, role, phone, email, is_primary)
- **`crm_interactions`** — Timeline entries (call, email, meeting, note, linkedin, site_visit, other)
- **`crm_research_notes`** — Findings with optional source URLs
- **`ops_announcements`** — In-app banners with start/end dates
- **`ops_approval_requests`** — Workflow approvals (pending/approved/rejected)

All tables have RLS enabled; access is server-only via Vercel API (service role).

**To apply:**

```bash
# In Supabase dashboard → SQL Editor
# Paste and run: supabase/migrations/002_crm_and_ops.sql
```

---

### 2. **Vercel API Routes**

**Files:**

- `api/crm.ts` — Full CRUD for accounts, contacts, interactions, research notes + CSV/legacy import
- `api/ops.ts` — Announcements (GET) + approval create/resolve (POST)
- `api/cron/ops.ts` — Placeholder cron handler (daily 7am UTC) with `CRON_SECRET` verification

**`vercel.json` updates:**

- Added cron schedule: `{ "path": "/api/cron/ops", "schedule": "0 7 * * *" }`
- Rewrites unchanged (SPA fallback to `index.html`)

**Environment variables required (Vercel dashboard):**

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (optional, for cron auth)

---

### 3. **React Query + Tailwind v4 + shadcn/ui**

**Installed packages:**

```json
{
  "@tanstack/react-query": "^5.96.0",
  "tailwindcss": "^4.2.2",
  "@tailwindcss/vite": "^4.2.2",
  "tailwind-merge": "^3.5.0",
  "class-variance-authority": "^0.7.1",
  "@radix-ui/react-*": "...",
  "motion": "latest"
}
```

**Wiring:**

- `src/lib/queryClient.ts` — QueryClient with 30s staleTime, 2 retries
- `src/main.tsx` — Wrapped `<App>` in `<QueryClientProvider>`
- `vite.config.ts` — Added `@tailwindcss/vite` plugin, `resolve.alias` for `@/*`
- `src/index.css` — Added `@import "tailwindcss";` + `@theme` tokens mapped to existing CSS vars
- `tsconfig.app.json` — Added `paths: { "@/*": ["./src/*"] }`

**shadcn/ui components created:**

- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/dialog.tsx`

All use existing CSS var tokens (`--primary-green`, `--text-primary`, etc.) for seamless integration.

---

### 4. **CRM Pages — Accounts, Contacts, Interactions, Research**

**Files:**

- `src/pages/CRM.tsx` — Account list with search, CSV import/export, legacy lead migration
- `src/pages/CrmAccountDetail.tsx` — Tabbed detail view (contacts, timeline, research, overview)
- `src/lib/crmTypes.ts` — TypeScript types for all CRM entities
- `src/lib/crmApi.ts` — Fetch helpers (`fetchCrmAccounts`, `fetchCrmAccountBundle`, `crmPost`, import helpers)
- `src/hooks/useCrm.ts` — React Query hooks (`useCrmAccounts`, `useCrmAccountDetail`, `useCrmMutations`)

**Routes added to `src/App.tsx`:**

```tsx
<Route path="/crm" element={<ProtectedRoute><CRM /></ProtectedRoute>} />
<Route path="/crm/accounts/:accountId" element={<ProtectedRoute><CrmAccountDetail /></ProtectedRoute>} />
```

**Features:**

- **Accounts list:** Search, type/status badges, CSV import (loose parser), CSV export, auto-migrates `localStorage.crmLeads` on first load
- **Account detail tabs:**
  - **Contacts:** Add/remove contacts, mark primary, phone/email/role/notes
  - **Timeline:** Log interactions (call, email, meeting, note, linkedin, site_visit, other) with occurred_at + detail
  - **Research:** Add/edit/delete notes with title, body, source URL
  - **Overview:** Read-only summary of account fields
- **Edit account dialog:** Update all fields (name, company, type, status, phone, email, address, marketing source, notes)
- **Delete account:** Cascades to contacts, interactions, research notes (Supabase FK)

**Data flow:**

1. Browser → `/api/crm?action=accounts` → Supabase service role → accounts array
2. Browser → `/api/crm?action=account&id=<uuid>` → Supabase → account + contacts + interactions + research_notes
3. Mutations → `POST /api/crm` with `{ action: 'account.create', ... }` → Supabase insert/update/delete → React Query invalidates cache

**Legacy migration:**

- On mount, `CRM.tsx` checks `localStorage.crmLeads` (old simple leads array)
- If found, calls `POST /api/crm { action: 'import_legacy_leads', leads: [...] }`
- API creates accounts + primary contacts, returns imported IDs
- Clears `localStorage.crmLeads` after success

---

### 5. **Layout Announcements + Capacitor**

**Announcements:**

- `src/components/AnnouncementBanner.tsx` — Fetches active announcements from `/api/ops?resource=announcements`, renders dismissible banners
- `src/components/Layout.tsx` — Added `<AnnouncementBanner />` above `{children}` in `main-content__inner`
- Filters by `is_active`, `starts_at`, `ends_at` (server + client-side)

**Admin approvals:**

- `src/components/AdminApprovalsCard.tsx` — Fetches pending approvals, shows approve/reject buttons (admin-only)
- `src/pages/Dashboard.tsx` — Added `<AdminApprovalsCard />` at top (only visible to `currentUser.isAdmin`)
- Mutations call `POST /api/ops { action: 'approval.resolve', id, status, resolved_by }`

**Ops API:**

- `src/lib/opsApi.ts` — `fetchAnnouncements()`, `fetchApprovals(status)`, `opsPost<T>(body)`

**Capacitor (iOS + Android):**

- `capacitor.config.ts` — App ID `com.islandhydroseeding.ops`, webDir `dist`, androidScheme `https`
- `package.json` scripts:
  - `cap:sync` — Copy web assets to native projects
  - `cap:ios` — Open Xcode
  - `cap:android` — Open Android Studio
  - `build:mobile` — `npm run build && cap sync`
- Native projects created: `ios/`, `android/` (gitignored by default, add to repo if needed)

**To build mobile:**

```bash
npm run build:mobile
npm run cap:ios      # macOS only, requires Xcode
npm run cap:android  # requires Android Studio
```

---

### 6. **MorphingPlusX Animation** (Bonus)

**File:** `src/components/MorphingPlusX.tsx`

Animated SVG icon that rotates 45° when toggled, morphing `+` into `×`.

**Usage:**

```tsx
<MorphingPlusX isOpen={formOpen} size={16} />
```

**Applied to:**

- `src/pages/Equipment.tsx` — "New work order" / "Close form" button

**Animation:**

- 0° (closed) → 45° (open) rotation
- 300ms duration with custom easing `[0.33, 1, 0.68, 1]`
- Two perpendicular lines (vertical + horizontal) form the `+`, rotation makes it look like `×`

---

## 📋 Next Steps

1. **Run migration 002 in Supabase dashboard** (SQL Editor)
2. **Set Vercel env vars** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `CRON_SECRET`)
3. **Deploy to Vercel** — API routes will be live
4. **Test CRM flow:**
   - Create account → add contacts → log interactions → add research notes
   - CSV import/export
   - Delete account (verify cascade)
5. **Test announcements:**
   - Insert row in `ops_announcements` (Supabase dashboard)
   - Verify banner appears in app
6. **Test approvals (admin only):**
   - Insert row in `ops_approval_requests`
   - Verify admin sees card on Dashboard
   - Approve/reject
7. **Mobile build (optional):**
   - `npm run build:mobile`
   - Open in Xcode/Android Studio
   - Test on device/simulator

---

## 🔧 Fixes Applied

- **TZDate constructor signature:** Fixed `vancouverTime.ts` to match `@date-fns/tz` v4 API (timezone as last param)
- **Unused imports:** Removed `MorphingSquare` from `main.tsx`, `CRM.tsx`; removed `vancouverDateInputFromIso` from `Tasks.tsx`
- **Tailwind v4 syntax:** Avoided `animate-*` classes (not in v4 yet), used inline `@theme` tokens
- **Dialog animations:** Removed data-state animate classes (not in Radix v1.1 by default)

---

## 📦 File Summary

**New files (37):**

- `supabase/migrations/002_crm_and_ops.sql`
- `api/crm.ts`, `api/ops.ts`, `api/cron/ops.ts`
- `src/lib/crmTypes.ts`, `src/lib/crmApi.ts`, `src/lib/opsApi.ts`, `src/lib/queryClient.ts`, `src/lib/utils.ts`
- `src/hooks/useCrm.ts`
- `src/pages/CRM.tsx`, `src/pages/CrmAccountDetail.tsx`
- `src/components/ui/*.tsx` (11 files)
- `src/components/AnnouncementBanner.tsx`, `src/components/AdminApprovalsCard.tsx`, `src/components/MorphingPlusX.tsx`
- `capacitor.config.ts`
- `UPGRADE_SUMMARY.md` (this file)

**Modified files (11):**

- `package.json` — Added deps + Capacitor scripts
- `vite.config.ts` — Tailwind plugin + alias
- `tsconfig.app.json` — Added `@/*` paths
- `src/index.css` — Tailwind import + theme tokens
- `src/main.tsx` — QueryClientProvider
- `src/App.tsx` — CRM routes
- `src/lib/cloudSync.ts` — Removed `crmLeads` from sync keys (now server-side)
- `src/lib/vancouverTime.ts` — Fixed TZDate constructor
- `src/components/Layout.tsx` — AnnouncementBanner
- `src/pages/Dashboard.tsx` — AdminApprovalsCard
- `src/pages/Equipment.tsx` — MorphingPlusX button
- `vercel.json` — Cron config

**Dependencies added:**

- `@tanstack/react-query`, `tailwindcss`, `@tailwindcss/vite`, `tailwind-merge`, `class-variance-authority`
- `@radix-ui/react-*` (dialog, label, tabs, separator, scroll-area, slot)
- `@capacitor/cli`, `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`
- `motion` (Framer Motion v12+)
- `jspdf`, `jspdf-autotable`, `xlsx` (already present, used for CSV/export)

---

## 🎨 Design Notes

- **Tailwind v4 scoped:** Uses `@theme` to map to existing CSS vars, no conflicts with global `.btn`, `.card` classes
- **shadcn/ui tokens:** All components reference `var(--primary-green)`, `var(--text-primary)`, etc. — matches existing theme
- **Dark mode:** Existing `html.theme-dark` classes work unchanged; shadcn components inherit tokens
- **Mobile-first:** Existing responsive CSS + Capacitor = native feel on iOS/Android
- **Animation:** MorphingPlusX uses `motion/react` (Framer Motion v12) for smooth 45° rotation

---

## 🚀 Deployment Checklist

- [ ] Run `supabase/migrations/002_crm_and_ops.sql` in Supabase dashboard
- [ ] Set Vercel env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`)
- [ ] Push to GitHub → Vercel auto-deploys
- [ ] Test CRM flow (create account, contacts, interactions, research)
- [ ] Test CSV import/export
- [ ] Test announcements (insert row, verify banner)
- [ ] Test approvals (admin only, insert row, approve/reject)
- [ ] (Optional) Build mobile: `npm run build:mobile` → open in Xcode/Android Studio

---

**Build status:** ✅ Passes (`npm run build` — 0 errors, 0 warnings except chunk size)

**Compatibility:** React 19, Vite 8, TypeScript 5.9, Tailwind v4, Capacitor 8, Supabase 2.101, Vercel Node 5
