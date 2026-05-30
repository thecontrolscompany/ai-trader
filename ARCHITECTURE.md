# AI Trader — Architecture & Design Document

## Overview

AI Trader is a paper-trading (hypothetical) web platform designed to evaluate AI-driven analytics against real market data across stocks, bonds, ETFs, and other instruments. The platform allows users to define trade targets, log simulated trades, and measure actual vs. AI-predicted performance over time — without risking real capital.

---

## Goals & Objectives

### Primary Goals
1. **Evaluate AI analytics** — Benchmark AI-generated trade signals against real market outcomes using historical and live price data.
2. **Simulate paper trades** — Allow users to enter hypothetical buy/sell orders with tracked entry price, position size, and exit targets.
3. **Track portfolio performance** — Provide P&L, win/loss rate, and return metrics per trade and across the full portfolio.
4. **Support multiple asset classes** — Stocks, ETFs, bonds, and optionally crypto and options.

### Secondary Goals
- Log AI confidence scores alongside each trade suggestion to build a long-term evaluation dataset.
- Support multiple AI model providers (OpenAI, Anthropic Claude, etc.) so signal quality can be compared across models.
- Export trade history and analytics for offline review.
- Provide charting and visualization of trade entry/exit points on price history.

---

## User Flows

### 1. Trade Entry
- User selects a ticker symbol (e.g., `AAPL`, `SPY`, `TLT`).
- User sets: position type (long/short), entry price, quantity, stop-loss, and take-profit targets.
- Optional: attach an AI signal with confidence score and reasoning.
- Trade is recorded as "open" and tracked against live/delayed price data.

### 2. AI Trade Target Identification
- User requests AI analysis for a ticker.
- AI returns: trade direction, entry zone, target price, stop-loss, time horizon, and confidence score.
- User can accept the suggestion (creating a tracked paper trade) or dismiss it.

### 3. Portfolio Dashboard
- Displays all open and closed paper trades.
- Shows unrealized/realized P&L, win rate, average gain/loss, and total return.
- Filters by asset class, date range, and AI model used.

### 4. Performance Reporting
- Per-trade: entry/exit price, duration, P&L, AI signal accuracy.
- Aggregate: equity curve, Sharpe ratio estimate, drawdown.
- AI model comparison: which model's signals performed best.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Web UI)                │
│  Next.js + React + TailwindCSS + Recharts           │
│                                                     │
│  Pages: Dashboard / Trade Entry / Analysis /        │
│         Portfolio / Reports                         │
└───────────────────────┬─────────────────────────────┘
                        │ REST / WebSocket
┌───────────────────────▼─────────────────────────────┐
│                  Backend API                        │
│  Node.js (Express or Next.js API routes)            │
│                                                     │
│  Modules:                                           │
│  - Trade Manager (CRUD for paper trades)            │
│  - Market Data Service (price feeds)                │
│  - AI Signal Engine (LLM integrations)              │
│  - Portfolio Calculator (P&L, metrics)              │
│  - Auth (session / user accounts)                   │
└──────┬──────────────────────┬────────────────────────┘
       │                      │
┌──────▼──────┐     ┌─────────▼────────────┐
│  Database   │     │  External APIs        │
│  SQLite     │     │                       │
│  (dev)      │     │  - Alpha Vantage /    │
│  or         │     │    Polygon.io /       │
│  PostgreSQL │     │    Yahoo Finance      │
│  (prod)     │     │    (market data)      │
└─────────────┘     │                       │
                    │  - Anthropic Claude   │
                    │  - OpenAI GPT         │
                    │    (AI signals)        │
                    └───────────────────────┘
```

---

## Data Models

### Trade
```
id            UUID
ticker        string         (e.g., "AAPL")
asset_class   enum           (stock | etf | bond | crypto | option)
direction     enum           (long | short)
status        enum           (open | closed | cancelled)
entry_price   decimal
quantity      decimal
stop_loss     decimal | null
take_profit   decimal | null
exit_price    decimal | null
opened_at     timestamp
closed_at     timestamp | null
notes         text | null
ai_signal_id  UUID | null
```

### AISignal
```
id             UUID
ticker         string
model          string         (e.g., "claude-sonnet-4-6", "gpt-4o")
direction      enum           (long | short | neutral)
entry_zone_low decimal
entry_zone_high decimal
target_price   decimal
stop_loss      decimal
time_horizon   string         (e.g., "1 week", "3 months")
confidence     float          (0.0 – 1.0)
reasoning      text
created_at     timestamp
```

### Portfolio (derived / computed)
```
total_trades       int
open_trades        int
closed_trades      int
win_rate           float
total_pnl          decimal
unrealized_pnl     decimal
realized_pnl       decimal
avg_gain           decimal
avg_loss           decimal
```

---

## Tech Stack

| Layer           | Choice                          | Rationale                                     |
|-----------------|----------------------------------|-----------------------------------------------|
| Frontend        | Next.js 14 (App Router)         | Full-stack React, easy API routes, SSR        |
| Styling         | Tailwind CSS + shadcn/ui        | Rapid UI development, accessible components  |
| Charts          | Recharts or TradingView Lightweight Charts | Financial charting, candlestick support |
| Backend         | Next.js API Routes              | Collocated with frontend, minimal boilerplate |
| Database        | SQLite (dev) / PostgreSQL (prod)| Simple local dev, scalable in production     |
| ORM             | Drizzle ORM                     | Lightweight, type-safe, great DX             |
| Market Data     | Alpha Vantage or Polygon.io     | Free tier available, broad coverage          |
| AI Integration  | Anthropic SDK + OpenAI SDK      | Multi-model signal comparison                |
| Auth            | NextAuth.js                     | Session management, easy provider support    |
| Deployment      | Vercel — timandshanestock.com   | Confirmed target; Next.js native integration |

---

## Module Breakdown

### Frontend Pages

| Route               | Purpose                                              |
|---------------------|------------------------------------------------------|
| `/`                 | Dashboard — portfolio summary + recent trades        |
| `/trades`           | Trade list with filters and sorting                  |
| `/trades/new`       | Enter a new paper trade manually                     |
| `/trades/[id]`      | Individual trade detail + chart                      |
| `/analyze`          | Request AI analysis for a ticker                     |
| `/signals`          | History of all AI-generated signals                  |
| `/reports`          | Performance analytics and equity curve               |

### Backend Services

- **TradeService** — Create, update, close, and delete paper trades. Calculates realized P&L on close.
- **MarketDataService** — Fetches current and historical prices. Caches aggressively to stay within API rate limits.
- **AISignalService** — Sends ticker + context to selected AI model, parses structured trade signal from response.
- **PortfolioService** — Aggregates trade data into summary metrics (P&L, win rate, drawdown, etc.).

---

## AI Signal Integration

The AI Signal Engine queries a language model with a structured prompt containing:
- Recent price action (OHLCV data, last N periods)
- Key technical indicators (RSI, MACD, moving averages)
- Asset class and market context
- User-defined investment style preferences (optional)

The model is instructed to respond in a JSON schema matching the `AISignal` model. Confidence scores are normalized and stored for later accuracy evaluation once trades close.

---

## Phase Plan

### Phase 1 — Foundation
- [ ] Project scaffolding (Next.js + Tailwind + Drizzle)
- [ ] Database schema and migrations
- [ ] Basic CRUD for paper trades
- [ ] Market data integration (price lookup by ticker)
- [ ] Dashboard with open positions list

### Phase 2 — AI Integration
- [ ] AI signal request UI (analyze page)
- [ ] Claude / GPT signal endpoint
- [ ] Link signals to trades
- [ ] Signal history view

### Phase 3 — Analytics
- [ ] P&L calculation (realized + unrealized)
- [ ] Portfolio metrics (win rate, avg gain/loss, drawdown)
- [ ] Equity curve chart
- [ ] AI model accuracy report

### Phase 4 — Polish
- [ ] Authentication (multi-user support)
- [ ] Trade filtering, sorting, and search
- [ ] CSV export
- [ ] Candlestick chart with trade entry/exit markers
- [ ] Deployment

---

## Out of Scope (for now)
- Real brokerage integration / live order execution
- Options chains and complex derivatives modeling
- Real-time streaming quotes (delayed data is sufficient for paper trading)
- Mobile native app
