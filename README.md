# ExpenseAI — AI-Powered Receipt Tracker for India

A full-stack expense tracking application built for the Indian tax context. Photograph a receipt and Llama 4 Scout (via Groq) extracts all the data automatically — merchant, line items, GST rate, ITC eligibility, and anomaly flags. Built for freelancers and small businesses that need clean records for their CA.

**Live:** `https://t3-expense-tracker-zeta.vercel.app`

---

## Features

**AI Receipt Scanning** — Upload a photo and the app extracts merchant, date, category, line items, subtotal, GST amount, GST rate, and total. No manual entry required.

**GST & ITC Tracking** — Automatically calculates Input Tax Credit claimable on business expenses. Each receipt is tagged as business or personal, with gstCredit calculated accordingly.

**Anomaly Detection** — After each extraction, the app computes the user's average spend for that category. Receipts that exceed 3× that average are flagged automatically with a reason stored on the record.

**Analytics Dashboard** — Monthly spend by category with visual bars, budget utilization per category, 6-month trend chart, flagged receipt review list, and KPI cards for total spend, tax paid, ITC claimable, and flagged count.

**Indian Income Tax Comparison** — Enter annual income and see a side-by-side old vs new regime breakdown for FY 2024-25, including correct slab rates, standard deductions, and 4% education cess.

**CA-Ready CSV Export** — Export receipts filtered by date range or business-only, with all columns a chartered accountant needs: merchant, date, GST rate, GST amount, ITC claimable, flagged status.

**Rate Limiting** — Sliding window limiter caps AI extractions at 20 per user per hour, enforced before any storage or database work.

**Storage Cleanup** — Deleting a receipt removes its image from Supabase Storage, preventing bucket accumulation.

**Mobile-First UI** — `viewport-fit=cover` with `env(safe-area-inset-bottom)` for Android gesture navigation. All touch targets ≥ 40px. Dark `#0a0a0f` theme throughout.

---

## Architecture

```
User (mobile browser)
        │
        ▼
   Vercel — Next.js 15
   ├── NextAuth v5  (Discord OAuth)
   ├── tRPC API
   └── upload mutation
         ├── Supabase Storage  ← image stored here
         ├── Groq Vision API   ← Llama 4 Scout extracts data
         └── Supabase PostgreSQL ← receipt + line items persisted
```

Everything runs on Vercel. Groq extraction is synchronous — the mutation completes when the data is ready and returns the full result in one round trip.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| API | tRPC v11 |
| ORM | Drizzle ORM |
| Database | Supabase PostgreSQL |
| File Storage | Supabase Storage |
| Auth | NextAuth v5 — Discord OAuth |
| AI | Groq API — Llama 4 Scout 17B |
| Deployment | Vercel |
| Styling | Tailwind CSS |
| Validation | Zod |

---

## Database Schema

```
users              NextAuth users
accounts           OAuth provider accounts
sessions           Active sessions
verificationTokens Email verification

receipts           Core table
  id, userId, imageUrl
  status           processing | done | failed
  merchant, date, category, currency
  subtotal, tax, fees, fines, total
  gstRate, gstCredit
  isBusinessExp    boolean
  flagged          boolean — anomaly detection result
  flagReason       text — why it was flagged
  createdAt

lineItems          Per-receipt line items (cascade delete)
  id, receiptId, name, quantity, price

userProfiles       Per-user preferences
  userId, profession
  taxRegime        old | new
  monthlyBudgets   JSONB — per-category spend limits
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Supabase project with a storage bucket named `receipts`
- Discord OAuth application
- Groq API key (free tier works)

### Setup

```bash
git clone https://github.com/kshwadip/t3-expense-tracker.git
cd t3-expense-tracker
npm install
```

Create a `.env` file:

```env
# Database
DATABASE_URL=postgresql://...    # Supabase pgbouncer pooler — port 6543
DIRECT_URL=postgresql://...      # Supabase direct connection — port 5432

# Auth
AUTH_SECRET=any-random-string
AUTH_DISCORD_ID=your-discord-client-id
AUTH_DISCORD_SECRET=your-discord-client-secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Groq
GROQ_API_KEY=gsk_...
```

Push the schema and start:

```bash
npm run db:push
npm run dev
```

---

## Deployment

### Vercel

1. Connect the GitHub repo to Vercel
2. Add all env vars from the table below
3. Deploy — no additional services needed

### Environment Variables Reference

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase pgbouncer connection string (port 6543) |
| `DIRECT_URL` | Supabase direct connection (port 5432) — used by Drizzle migrations |
| `AUTH_SECRET` | Random secret for NextAuth session signing |
| `AUTH_DISCORD_ID` | Discord OAuth application client ID |
| `AUTH_DISCORD_SECRET` | Discord OAuth application client secret |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — used server-side for storage |
| `GROQ_API_KEY` | Groq API key for Llama 4 Scout vision extraction |

---

## Project Structure

```
src/
├── app/
│   ├── dashboard/page.tsx        Analytics dashboard
│   ├── upload/page.tsx           Receipt upload + AI extraction
│   ├── receipts/page.tsx         Receipt history + CSV export
│   ├── profile/page.tsx          Tax regime + monthly budget settings
│   └── _components/
│       └── nav.tsx               Mobile bottom navigation
├── server/
│   ├── api/routers/
│   │   ├── receipts.ts           upload, getAll, getById, delete, exportCsv
│   │   ├── analytics.ts          dashboard, trend, taxComparison
│   │   └── profile.ts            get, upsert
│   ├── db/
│   │   └── schema.ts             Drizzle schema definitions
│   ├── lib/
│   │   └── rate-limit.ts         Sliding window in-memory rate limiter
│   └── auth/                     NextAuth v5 configuration
└── lib/
    └── supabase.ts               uploadReceiptImage, deleteReceiptImage
```

---

## License

MIT