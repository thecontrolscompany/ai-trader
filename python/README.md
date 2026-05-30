# Tim & Shane Stocks — AI Trading Research CLI

> ⚠️ **NOT FINANCIAL ADVICE.** This is a paper-trading research tool for educational purposes only. No real money is ever at risk.

A Python command-line companion to the Tim & Shane Stocks web app. Scans stocks, backtests strategies, runs AI analysis, and places paper trades through Alpaca.

---

## Quick Start

```bash
cd python/

# 1. Create virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment variables
cp .env.example .env
# Edit .env and add your API keys

# 4. Run
python main.py
```

---

## Setup

### Alpaca Paper Trading (required for paper trades)
1. Sign up free at https://app.alpaca.markets
2. Switch to **Paper Trading** in the top-left dropdown
3. Go to **API Keys** → generate a new key pair
4. Add to `.env`:
   ```
   ALPACA_API_KEY=your_key
   ALPACA_SECRET_KEY=your_secret
   ALPACA_BASE_URL=https://paper-api.alpaca.markets
   ```

### Claude (Anthropic)
- Get an API key at https://console.anthropic.com
- Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env`

### OpenAI
- Get an API key at https://platform.openai.com
- Add `OPENAI_API_KEY=sk-...` to `.env`

---

## Menu Options

| Key | Action |
|-----|--------|
| A | Show latest quotes for your watchlist |
| B | Run SMA Crossover + RSI strategy scan |
| C | Backtest a strategy on historical data |
| D | Show Alpaca paper account balance and positions |
| E | Place a paper trade (requires explicit "confirm") |
| F | Ask Claude or GPT-4o for plain-English stock analysis |
| G | View exported CSV reports in `output/` |

---

## Configuration (`config.yaml`)

| Setting | Default | Description |
|---------|---------|-------------|
| `watchlist` | SPY, QQQ, AAPL, MSFT, NVDA | Symbols to track |
| `broker` | alpaca | Broker to use |
| `risk.max_position_pct` | 5% | Max portfolio % in one trade |
| `risk.max_daily_loss_pct` | 2% | Stop trading if down this much |
| `risk.stop_loss_pct` | 5% | Auto-exit if position falls this far |
| `risk.min_confidence` | 60% | Minimum AI confidence to highlight a signal |
| `strategies.sma_crossover.short_window` | 20 | Fast moving average days |
| `strategies.sma_crossover.long_window` | 50 | Slow moving average days |
| `strategies.rsi.oversold` | 30 | RSI level to flag BUY |
| `strategies.rsi.overbought` | 70 | RSI level to flag SELL |
| `backtest.initial_capital` | $100,000 | Simulated starting capital |

---

## Project Structure

```
python/
├── main.py                  # CLI entry point
├── config.yaml              # Watchlist, risk, strategy config
├── requirements.txt
├── .env.example
├── src/
│   ├── brokers/
│   │   ├── base.py          # BrokerClient interface
│   │   └── alpaca.py        # AlpacaPaperClient
│   ├── market_data/
│   │   └── fetcher.py       # yfinance price + history fetcher
│   ├── strategies/
│   │   ├── base.py          # Signal + Strategy base classes
│   │   ├── sma_crossover.py # SMA golden/death cross
│   │   └── rsi.py           # RSI oversold/overbought
│   ├── backtesting/
│   │   └── engine.py        # Historical simulation engine
│   ├── ai/
│   │   └── analyst.py       # Claude + OpenAI advisory analysis
│   ├── reports/
│   │   └── export.py        # CSV export
│   └── risk.py              # Position size + daily loss guards
└── output/                  # Generated CSV reports (gitignored)
```

---

## Broker Alternatives

| Broker | Paper Trading | API Quality | Notes |
|--------|---------------|-------------|-------|
| **Alpaca** ✅ | Free | Excellent | Best choice — free paper trading, REST + WebSocket API, no minimums |
| **Interactive Brokers** | Yes (TWS) | Complex | Requires funded account, IBKR TWS desktop app. Use `ib_insync` library. |
| **Tradier** | Yes | Good | Commission-free options trading, requires approved account. |
| **Robinhood** | ❌ Equities | Unofficial only | No official equities API. Crypto API only (unofficial libraries are ToS violations). |

---

## Disclaimer

This software is provided for **educational and research purposes only**.
- It does not constitute financial, investment, or trading advice.
- Past backtest performance does not predict future results.
- Always consult a licensed financial advisor before investing real money.
- The authors are not responsible for any financial losses.
