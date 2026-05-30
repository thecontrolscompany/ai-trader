import csv
import os
from datetime import datetime

from src.backtesting.engine import BacktestResult
from src.strategies.base import Signal


OUTPUT_DIR = "output"


def _ensure_output_dir():
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def save_backtest_csv(result: BacktestResult) -> str:
    """Save backtest trade log and summary to CSV. Returns the file path."""
    _ensure_output_dir()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(OUTPUT_DIR, f"backtest_{result.symbol}_{result.strategy}_{ts}.csv")

    with open(path, "w", newline="") as f:
        writer = csv.writer(f)

        # Summary block
        writer.writerow(["BACKTEST SUMMARY"])
        writer.writerow(["NOT FINANCIAL ADVICE — Paper trading research only"])
        writer.writerow([])
        for k, v in result.summary_dict().items():
            writer.writerow([k, v])
        writer.writerow([])

        # Trade log
        writer.writerow(["TRADE LOG"])
        writer.writerow(["Symbol", "Entry Date", "Exit Date", "Entry Price", "Exit Price", "Qty", "P&L $", "P&L %", "Reason"])
        for t in result.trades:
            writer.writerow([
                t.symbol, t.entry_date, t.exit_date or "",
                f"{t.entry_price:.2f}", f"{t.exit_price:.2f}" if t.exit_price else "",
                f"{t.qty:.4f}",
                f"{t.pnl:.2f}" if t.pnl is not None else "",
                f"{t.pnl_pct:.2f}%" if t.pnl_pct is not None else "",
                t.signal_reason,
            ])

    return path


def save_scan_csv(signals: list[Signal]) -> str:
    """Save a strategy scan result to CSV."""
    _ensure_output_dir()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(OUTPUT_DIR, f"scan_{ts}.csv")

    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["NOT FINANCIAL ADVICE — Paper trading research only"])
        writer.writerow(["Symbol", "Signal", "Confidence", "Strategy", "Reason"])
        for s in signals:
            writer.writerow([s.symbol, s.signal.value, f"{s.confidence:.0%}", s.strategy, s.reason])

    return path
