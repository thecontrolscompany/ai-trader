"""
Tim & Shane Stocks — AI Trading Research CLI
=============================================
⚠️  THIS IS NOT FINANCIAL ADVICE.
All trades are PAPER (simulated). No real money is ever used or at risk.
This tool is for research and educational purposes only.
"""
import os
import sys

# Load .env before any module that needs API keys
from dotenv import load_dotenv
load_dotenv()

import yaml
from tabulate import tabulate
from colorama import init, Fore, Style

init(autoreset=True)  # Windows color support

# ── helpers ─────────────────────────────────────────────────────────────────

def banner():
    print(Fore.YELLOW + Style.BRIGHT + """
╔══════════════════════════════════════════════════╗
║       TIM & SHANE STOCKS — AI Research CLI       ║
║         Paper Trading · Not Financial Advice      ║
╚══════════════════════════════════════════════════╝""")
    print(Fore.RED + "⚠️  PAPER TRADING MODE — No real money at risk.\n")


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def pause():
    input(Fore.CYAN + "\nPress Enter to continue…")


def pick(prompt: str, options: list[str]) -> str:
    """Simple numbered menu. Returns the chosen option string."""
    print()
    for i, o in enumerate(options, 1):
        print(f"  {Fore.YELLOW}{i}{Style.RESET_ALL}. {o}")
    while True:
        choice = input(f"\n{prompt} [1-{len(options)}]: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(options):
            return options[int(choice) - 1]
        print(Fore.RED + "Invalid choice, try again.")


# ── menu actions ─────────────────────────────────────────────────────────────

def show_watchlist(cfg: dict):
    """Option A — show latest quotes for the watchlist."""
    from src.market_data import MarketDataFetcher
    symbols = cfg["watchlist"]
    print(Fore.CYAN + f"\nFetching quotes for {len(symbols)} symbols…\n")
    fetcher = MarketDataFetcher()
    rows = []
    for sym in symbols:
        try:
            q = fetcher.get_quote(sym)
            chg_color = Fore.GREEN if q.change_pct >= 0 else Fore.RED
            rows.append([
                Fore.YELLOW + q.symbol + Style.RESET_ALL,
                q.name[:28],
                f"${q.price:.2f}",
                chg_color + f"{q.change_pct:+.2f}%" + Style.RESET_ALL,
                f"${q.market_cap/1e9:.1f}B" if q.market_cap else "—",
                f"{q.pe_ratio:.1f}" if q.pe_ratio else "—",
                f"${q.eps:.2f}" if q.eps else "—",
                f"{q.beta:.2f}" if q.beta else "—",
            ])
        except Exception as e:
            rows.append([sym, f"Error: {e}", "", "", "", "", "", ""])

    print(tabulate(rows, headers=["Symbol", "Name", "Price", "Chg %", "Mkt Cap", "P/E", "EPS", "Beta"]))
    pause()


def run_strategy_scan(cfg: dict):
    """Option B — run SMA and RSI strategies across the watchlist."""
    from src.market_data import MarketDataFetcher
    from src.strategies import SMACrossoverStrategy, RSIStrategy
    from src.reports import save_scan_csv

    fetcher = MarketDataFetcher()
    sma_cfg = cfg["strategies"]["sma_crossover"]
    rsi_cfg = cfg["strategies"]["rsi"]

    sma = SMACrossoverStrategy(sma_cfg["short_window"], sma_cfg["long_window"])
    rsi = RSIStrategy(rsi_cfg["period"], rsi_cfg["oversold"], rsi_cfg["overbought"])

    bt_cfg = cfg["backtest"]
    symbols = cfg["watchlist"]
    min_conf = cfg["risk"]["min_confidence"]

    print(Fore.CYAN + f"\nScanning {len(symbols)} symbols…\n")
    all_signals = []
    rows = []
    for sym in symbols:
        try:
            df = fetcher.get_history(sym, bt_cfg["start_date"], bt_cfg["end_date"])
            s1 = sma.generate_signal(sym, df)
            s2 = rsi.generate_signal(sym, df)
            for sig in [s1, s2]:
                all_signals.append(sig)
                flag = "✓" if sig.confidence >= min_conf else ""
                sig_color = Fore.GREEN if sig.signal.value == "BUY" else (Fore.RED if sig.signal.value == "SELL" else Fore.WHITE)
                rows.append([
                    Fore.YELLOW + sym + Style.RESET_ALL,
                    sig.strategy,
                    sig_color + sig.signal.value + Style.RESET_ALL,
                    f"{sig.confidence:.0%}",
                    Fore.GREEN + flag + Style.RESET_ALL,
                    sig.reason[:60] + ("…" if len(sig.reason) > 60 else ""),
                ])
        except Exception as e:
            rows.append([sym, "—", "ERROR", "—", "", str(e)[:60]])

    print(tabulate(rows, headers=["Symbol", "Strategy", "Signal", "Conf", "≥Thresh", "Reason"]))
    print(Fore.YELLOW + f"\n✓ = confidence ≥ {min_conf:.0%} (configurable in config.yaml)")

    save_path = save_scan_csv(all_signals)
    print(Fore.GREEN + f"\nScan saved to {save_path}")
    pause()


def run_backtest(cfg: dict):
    """Option C — backtest a strategy on a chosen symbol."""
    from src.strategies import SMACrossoverStrategy, RSIStrategy
    from src.backtesting import BacktestEngine
    from src.reports import save_backtest_csv

    symbol = pick("Choose symbol", cfg["watchlist"])
    strategy_name = pick("Choose strategy", ["SMA Crossover", "RSI"])

    sma_cfg = cfg["strategies"]["sma_crossover"]
    rsi_cfg = cfg["strategies"]["rsi"]
    bt_cfg = cfg["backtest"]

    strategy = (
        SMACrossoverStrategy(sma_cfg["short_window"], sma_cfg["long_window"])
        if strategy_name == "SMA Crossover"
        else RSIStrategy(rsi_cfg["period"], rsi_cfg["oversold"], rsi_cfg["overbought"])
    )

    engine = BacktestEngine(
        initial_capital=bt_cfg["initial_capital"],
        stop_loss_pct=cfg["risk"]["stop_loss_pct"],
        position_pct=0.10,
    )

    print(Fore.CYAN + f"\nRunning backtest: {symbol} / {strategy_name} ({bt_cfg['start_date']} → {bt_cfg['end_date']})…\n")
    result = engine.run(symbol, strategy, bt_cfg["start_date"], bt_cfg["end_date"])

    rows = [[k, v] for k, v in result.summary_dict().items()]
    print(tabulate(rows, tablefmt="rounded_outline"))

    color = Fore.GREEN if result.total_return_pct >= 0 else Fore.RED
    print(color + f"\n→ {result.total_return_pct:+.2f}% return over the period on ${bt_cfg['initial_capital']:,.0f} starting capital.")
    print(Fore.RED + "⚠️  Past performance does not predict future results.")

    save_path = save_backtest_csv(result)
    print(Fore.GREEN + f"Results saved to {save_path}")
    pause()


def get_broker_client(cfg: dict):
    """Return the configured broker client, or raise with a helpful message."""
    from src.brokers import AlpacaPaperClient, TradierClient
    broker = cfg.get("broker", "alpaca").lower()
    if broker == "tradier":
        return TradierClient()
    return AlpacaPaperClient()


def show_account(cfg: dict):
    """Option D — show account status for configured broker."""
    try:
        client = get_broker_client(cfg)
        acct = client.get_account()
        positions = client.get_positions()

        print(Fore.CYAN + "\n── Paper Account ──────────────────────")
        acct_rows = [
            ["Portfolio Value", f"${acct.portfolio_value:,.2f}"],
            ["Cash", f"${acct.cash:,.2f}"],
            ["Buying Power", f"${acct.buying_power:,.2f}"],
            ["Today's P&L", (Fore.GREEN if acct.day_pnl >= 0 else Fore.RED) + f"${acct.day_pnl:+,.2f} ({acct.day_pnl_pct:+.2f}%)" + Style.RESET_ALL],
        ]
        print(tabulate(acct_rows, tablefmt="plain"))

        if positions:
            print(Fore.CYAN + "\n── Open Positions ─────────────────────")
            pos_rows = [
                [
                    Fore.YELLOW + p.symbol + Style.RESET_ALL,
                    f"{p.qty:.2f}",
                    f"${p.avg_entry_price:.2f}",
                    f"${p.current_price:.2f}",
                    (Fore.GREEN if p.unrealized_pnl >= 0 else Fore.RED) + f"${p.unrealized_pnl:+,.2f} ({p.unrealized_pnl_pct:+.1f}%)" + Style.RESET_ALL,
                ]
                for p in positions
            ]
            print(tabulate(pos_rows, headers=["Symbol", "Qty", "Avg Entry", "Current", "Unrealized P&L"]))
        else:
            print(Fore.WHITE + "\nNo open positions.")
    except EnvironmentError as e:
        print(Fore.RED + f"\n{e}")
    pause()


def place_paper_trade(cfg: dict):
    """Option E — place a paper trade after explicit confirmation."""
    from src.risk import check_risk

    broker_name = cfg.get("broker", "alpaca").upper()
    print(Fore.RED + f"\n⚠️  PAPER/SIMULATED TRADE via {broker_name} — No real money is used.")
    symbol = input("Symbol (e.g. AAPL): ").strip().upper()
    if not symbol:
        return

    side = pick("Buy or Sell?", ["buy", "sell"])
    qty_str = input("Quantity (shares): ").strip()
    try:
        qty = float(qty_str)
    except ValueError:
        print(Fore.RED + "Invalid quantity.")
        return

    print(f"\n{Fore.YELLOW}You are about to place a PAPER {side.upper()} order for {qty} shares of {symbol}.")
    confirm = input("Type 'confirm' to proceed, anything else to cancel: ").strip().lower()
    if confirm != "confirm":
        print("Cancelled.")
        return

    try:
        client = get_broker_client(cfg)
        order = client.place_order(symbol, side, qty)
        print(Fore.GREEN + f"\n✓ Paper order submitted: {order.id}")
        print(f"  {order.symbol} | {order.side} {order.qty} | Status: {order.status}")
    except Exception as e:
        print(Fore.RED + f"Order failed: {e}")
    pause()


def ai_analysis(cfg: dict):
    """Option F — AI plain-English analysis of a watchlist symbol."""
    from src.market_data import MarketDataFetcher
    from src.strategies import SMACrossoverStrategy, RSIStrategy
    from src.ai import AIAnalyst

    symbol = pick("Choose symbol to analyze", cfg["watchlist"])
    provider = pick("Choose AI model", ["claude", "openai"])

    fetcher = MarketDataFetcher()
    sma_cfg = cfg["strategies"]["sma_crossover"]
    rsi_cfg = cfg["strategies"]["rsi"]
    bt_cfg = cfg["backtest"]

    print(Fore.CYAN + f"\nFetching data for {symbol}…")
    quote = fetcher.get_quote(symbol)
    df = fetcher.get_history(symbol, bt_cfg["start_date"], bt_cfg["end_date"])

    sma = SMACrossoverStrategy(sma_cfg["short_window"], sma_cfg["long_window"])
    rsi = RSIStrategy(rsi_cfg["period"], rsi_cfg["oversold"], rsi_cfg["overbought"])
    signals = [sma.generate_signal(symbol, df), rsi.generate_signal(symbol, df)]

    print(Fore.CYAN + f"Asking {provider.title()} to analyze {symbol}…\n")
    try:
        analyst = AIAnalyst(provider)
        analysis = analyst.analyze(quote, signals)
    except EnvironmentError as e:
        print(Fore.RED + str(e))
        pause()
        return

    rec_color = Fore.GREEN if "BUY" in analysis.recommendation else (Fore.RED if "SELL" in analysis.recommendation else Fore.YELLOW)
    print(f"Model: {analysis.model}")
    print(f"\n{Fore.CYAN}Summary:{Style.RESET_ALL}\n{analysis.summary}\n")
    print(f"Recommendation: {rec_color}{analysis.recommendation}{Style.RESET_ALL}  (confidence: {analysis.confidence:.0%})\n")
    print(f"{Fore.CYAN}Why:{Style.RESET_ALL}\n{analysis.reasoning}\n")
    print(f"{Fore.CYAN}Key Points:{Style.RESET_ALL}")
    for pt in analysis.key_points:
        print(f"  ▸ {pt}")
    print(Fore.RED + f"\n{analysis.disclaimer}")
    pause()


def export_report(cfg: dict):
    """Option G — export the most recent scan or backtest results."""
    print(Fore.CYAN + "\nAll reports are automatically saved to the output/ directory when you run a scan or backtest.")
    files = [f for f in os.listdir("output") if f.endswith(".csv")] if os.path.exists("output") else []
    if files:
        print(Fore.WHITE + f"\nExisting reports ({len(files)}):")
        for f in sorted(files)[-10:]:
            print(f"  📄 output/{f}")
    else:
        print(Fore.YELLOW + "\nNo reports yet. Run a scan or backtest first.")
    pause()


# ── main loop ────────────────────────────────────────────────────────────────

MENU = [
    ("A", "Show watchlist quotes",          show_watchlist),
    ("B", "Run strategy scan",              run_strategy_scan),
    ("C", "Run backtest",                   run_backtest),
    ("D", "Show paper account status",      show_account),
    ("E", "Place paper trade",              place_paper_trade),
    ("F", "AI plain-English analysis",      ai_analysis),
    ("G", "Export / view reports",          export_report),
    ("Q", "Quit",                           None),
]


def main():
    banner()
    cfg = load_config()

    while True:
        print(Fore.CYAN + Style.BRIGHT + "\nMAIN MENU")
        for key, label, _ in MENU:
            print(f"  {Fore.YELLOW}{key}{Style.RESET_ALL}. {label}")

        choice = input("\nChoice: ").strip().upper()
        action = next((fn for k, _, fn in MENU if k == choice), None)

        if choice == "Q":
            print(Fore.YELLOW + "\nGoodbye! Remember: not financial advice. 👋")
            sys.exit(0)
        elif action:
            try:
                action(cfg)
            except KeyboardInterrupt:
                print(Fore.YELLOW + "\n(Interrupted)")
        else:
            print(Fore.RED + "Unknown option. Try again.")


if __name__ == "__main__":
    main()
