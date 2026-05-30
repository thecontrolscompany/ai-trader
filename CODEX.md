# Tim & Shane Stocks — Codex Continuity Document

> This document gives any AI assistant (Claude Code, Codex, etc.) full context to pick up development without re-deriving anything from scratch.

---

## What This Project Is

A **paper trading platform** for Tim and Shane to evaluate AI-generated trade signals against real market data. No real money is ever at risk. The platform benchmarks AI signal quality over time.

**Live at:** https://timandshanestock.com  
**GitHub:** https://github.com/thecontrolscompany/ai-trader  
**Vercel project:** `thecontrolscompanys-projects/ai-trader` (Pro plan)

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) — **not standard Next.js; read `node_modules/next/dist/docs/` before writing code** |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL via Supabase |
| ORM | Drizzle ORM (postgres-js driver) |
| Auth | NextAuth v5 (Auth.js) — Google OAuth, email allowlist |
| AI | Anthropic Claude Sonnet 4.6 + OpenAI GPT-4o |
| Market data | Yahoo Finance (free, ~15min delay) |
| Deployment | Vercel Pro (required for cron jobs) |
| Route protection | `src/proxy.ts` (Next.js 16 renamed middleware → proxy) |

---

## Repository Structure

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                  → Home (re-exports /stocks)
│   │   ├── stocks/page.tsx           → Top 100 sortable stocks table (public)
│   │   ├── scan/page.tsx             → AI Scanner UI
│   │   ├── auto-trade/page.tsx       → Auto-trade settings
│   │   ├── accounts/page.tsx         → Portfolio/cash accounts
│   │   ├── trades/                   → Trade list, new trade, detail
│   │   ├── dashboard/page.tsx        → P&L summary (protected)
│   │   ├── login/page.tsx            → Google OAuth login page
│   │   └── api/
│   │       ├── stocks/               → Yahoo Finance screener proxy
│   │       ├── market/               → Single ticker quote
│   │       ├── trades/               → CRUD for paper trades
│   │       ├── accounts/             → Cash account management + reset
│   │       ├── scan/                 → AI stock scan (manual)
│   │       ├── auto-trade/           → Auto-trade settings CRUD + run
│   │       └── cron/auto-trade/      → Vercel cron endpoint (CRON_SECRET protected)
│   ├── db/
│   │   ├── schema.ts                 → All Drizzle table definitions
│   │   └── index.ts                  → DB client (postgres-js + Drizzle)
│   ├── lib/
│   │   ├── autoTradeEngine.ts        → Core auto-trade logic
│   │   ├── scanHelpers.ts            → Shared Claude/OpenAI scan prompts
│   │   ├── fetchStocks.ts            → Yahoo Finance stock fetcher (4 screeners + hidden gems)
│   │   ├── fees.ts                   → Robinhood fee calculation (SEC + FINRA)
│   │   ├── accounts.ts               → Stable account IDs (BANK_ID, BROKERAGE_ID)
│   │   ├── pnl.ts                    → P&L calculation helpers
│   │   └── id.ts                     → UUID generator
│   ├── components/
│   │   ├── NavBar.tsx                → Client component, conditional auth links
│   │   ├── BottomNav.tsx             → Mobile bottom tab bar
│   │   └── TickerBar.tsx             → Scrolling price ticker (client-side fetch)
│   ├── auth.ts                       → NextAuth config (Google + email allowlist)
│   └── proxy.ts                      → Route protection (Next.js 16 = proxy, not middleware)
├── python/                           → Standalone CLI companion tool
│   ├── main.py                       → CLI entry point
│   └── src/brokers/
│       ├── alpaca.py                 → Alpaca paper trading (active)
│       └── tradier.py                → Tradier scaffold (not yet configured)
├── supabase/migrations/              → SQL migration files (pushed via supabase CLI)
├── vercel.json                       → maxDuration overrides + 4x daily cron schedule
└── ARCHITECTURE.md                   → Goals, phase plan, data models
```

---

## Database Schema

All tables are in Supabase (PostgreSQL). Managed via Drizzle ORM + `supabase db push`.

### Key Tables

**`trades`** — Paper trades  
`id, ticker, asset_class, direction (long/short), status (open/closed/cancelled), entry_price, quantity, stop_loss, take_profit, exit_price, fees, opened_at, closed_at, notes, ai_signal_id`

**`ai_signals`** — AI-generated trade signals  
`id, ticker, model, direction, entry_zone_low/high, target_price, stop_loss, time_horizon, confidence, reasoning, created_at`

**`accounts`** — Cash accounts (2 rows, stable IDs)  
- Bank: `00000000-0000-0000-0000-000000000001`
- Brokerage: `00000000-0000-0000-0000-000000000002`

**`transfers`** — Every money movement (deposit, transfer, trade cost, proceeds)

**`auto_trade_settings`** — Single row `00000000-0000-0000-0000-000000000010`  
`enabled, model, min_confidence, max_trades_per_day, max_position_pct, auto_close, scan_frequency (1x/2x/3x/4x), deploy_mode (spread/fixed), last_run_at, last_run_summary`

**`auto_trade_log`** — Every auto-trade action with reason

---

## Environment Variables

### Vercel (production)
```
DATABASE_URL          Supabase pooler (aws-1-us-west-2.pooler.supabase.com:5432)
AUTH_SECRET           NextAuth secret
AUTH_GOOGLE_ID        Google OAuth client ID
AUTH_GOOGLE_SECRET    Google OAuth client secret
ALLOWED_EMAILS        Comma-separated: thecontrolscompany@gmail.com,Shanebradford0811@gmail.com
OPENAI_API_KEY        OpenAI GPT-4o key
ANTHROPIC_API_KEY     Anthropic Claude key (not yet added)
CRON_SECRET           Protects /api/cron/auto-trade from public calls
```

### Local `.env.local`
Same vars — see `.env.local.example` for format.

---

## Credentials (stored in project memory)

- **Supabase project:** `novlbbvydmiyplwolibw` — West US (Oregon)
- **Supabase pooler:** `postgresql://postgres.novlbbvydmiyplwolibw:[pass]@aws-1-us-west-2.pooler.supabase.com:5432/postgres`
- **Google OAuth:** Client ID in Vercel env vars
- **Allowed users:** Tim (`thecontrolscompany@gmail.com`), Shane (`Shanebradford0811@gmail.com`)

> Full credentials are in Claude Code project memory at:  
> `C:\Users\TimothyCollins\.claude\projects\c--Users-TimothyCollins-dev-AI-Trader\memory\reference_credentials.md`

---

## Key Patterns & Gotchas

### Next.js 16
- Route protection uses `src/proxy.ts`, **not** `src/middleware.ts` (renamed in v16)
- `params` in route handlers is a `Promise` — must `await params`
- `.get()` does not exist in Drizzle postgres — use array destructuring: `const [row] = await db.select()...`

### Migrations
Never edit existing migration files. Always add a new numbered file:
```bash
# Add new migration
# Create: supabase/migrations/YYYYMMDDNNNNNN_description.sql
supabase db push --password "T8n435/-?AzPBm2"
```
Direct DB hostname is IPv6-only on Windows — use pooler URL for all Node.js connections.

### Supabase CLI
```bash
supabase projects list                          # list projects
supabase db push --password "..." --debug       # push + see pooler URL
supabase link --project-ref novlbbvydmiyplwolibw
```

### Deploying
```bash
vercel --prod          # deploy
vercel env add KEY production --value "val" --yes   # add env var
```
Every `git push` to `master` auto-deploys via GitHub integration.

---

## Auto-Trade System

The auto-trader runs on a Vercel cron (requires Pro plan):
- **Schedule:** 9:30 AM, 11:30 AM, 1:30 PM, 3:00 PM ET — Mon–Fri
- **Endpoint:** `GET /api/cron/auto-trade` (requires `Authorization: Bearer CRON_SECRET`)
- **Manual trigger:** `POST /api/auto-trade/run` (bypasses market hours check)

**Engine flow (`src/lib/autoTradeEngine.ts`):**
1. Load settings, check enabled + market hours
2. Auto-close: check open positions against current price, close if stop/target hit
3. Run AI scan (Claude or GPT-4o) via `src/lib/scanHelpers.ts`
4. Filter picks by confidence threshold + skip already-open tickers
5. Size positions: **spread mode** = divide balance evenly across qualifying picks; **fixed mode** = X% per trade
6. Open trades, deduct from brokerage, log each action

**Fee model (Robinhood standard):**
- Buy: $0
- Sell: SEC fee ($0.0000278 × principal) + FINRA TAF ($0.000166/share, max $8.30)

---

## AI Stock Scanner

- Fetches from 4 Yahoo Finance screeners + 60+ hand-picked mid/small cap symbols
- Prompt explicitly avoids mega-caps (AAPL/MSFT/NVDA/TSLA/GOOGL) — looking for "diamonds in the rough"
- Returns 6-10 picks with: confidence, risk level (conservative/moderate/aggressive), risk:reward ratio, entry zone, target, stop loss, plain-English reasoning
- Both Claude and OpenAI supported; scan helpers shared in `src/lib/scanHelpers.ts`

---

## What's Next (Roadmap)

- [ ] Anthropic API key needs to be added to Vercel (Claude scanner doesn't work yet)
- [ ] Tradier broker client needs implementation (`python/src/brokers/tradier.py` is scaffolded)
- [ ] Real-time price data (Alpaca SIP $9/mo or Tradier free with account)
- [ ] Split auto-close check into its own high-frequency cron (no AI call)
- [ ] Per-user accounts (currently shared between Tim and Shane)
- [ ] Portfolio equity curve chart
- [ ] AI model accuracy report (compare signal confidence vs actual outcomes)
- [ ] CSV export of trade history

---

## Running Locally

```bash
cd C:\Users\TimothyCollins\dev\ai-trader
npm run dev          # start dev server at localhost:3000
npm run db:migrate   # run pending migrations (use pooler URL on Windows)
```

Python CLI:
```bash
cd python
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys
python main.py
```
