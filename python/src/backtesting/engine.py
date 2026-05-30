"""
Backtesting engine.
Simulates running a strategy on historical data to see how it would have performed.
Results are approximate — real trading has slippage, commissions, and timing differences.
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Optional

from src.strategies.base import Strategy, SignalType
from src.market_data.fetcher import MarketDataFetcher


@dataclass
class Trade:
    symbol: str
    entry_date: str
    exit_date: Optional[str]
    entry_price: float
    exit_price: Optional[float]
    qty: float
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None
    signal_reason: str = ""


@dataclass
class BacktestResult:
    symbol: str
    strategy: str
    start_date: str
    end_date: str
    initial_capital: float
    final_value: float
    total_return_pct: float
    win_rate_pct: float
    num_trades: int
    num_wins: int
    num_losses: int
    max_drawdown_pct: float
    avg_gain_pct: float
    avg_loss_pct: float
    trades: list[Trade] = field(default_factory=list)

    def summary_dict(self) -> dict:
        return {
            "Symbol": self.symbol,
            "Strategy": self.strategy,
            "Period": f"{self.start_date} → {self.end_date}",
            "Initial Capital": f"${self.initial_capital:,.2f}",
            "Final Value": f"${self.final_value:,.2f}",
            "Total Return": f"{self.total_return_pct:.2f}%",
            "Win Rate": f"{self.win_rate_pct:.1f}%",
            "Trades": self.num_trades,
            "Wins / Losses": f"{self.num_wins} / {self.num_losses}",
            "Max Drawdown": f"{self.max_drawdown_pct:.2f}%",
            "Avg Gain": f"{self.avg_gain_pct:.2f}%",
            "Avg Loss": f"{self.avg_loss_pct:.2f}%",
        }


class BacktestEngine:
    """
    Simple event-driven backtest.
    For each trading day, generates a signal and simulates entry/exit.
    Uses close prices — no look-ahead bias.
    """

    def __init__(
        self,
        initial_capital: float = 100_000.0,
        stop_loss_pct: float = 0.05,
        position_pct: float = 0.10,
    ):
        self.initial_capital = initial_capital
        self.stop_loss_pct = stop_loss_pct
        self.position_pct = position_pct  # fraction of capital per trade
        self._fetcher = MarketDataFetcher()

    def run(
        self,
        symbol: str,
        strategy: Strategy,
        start: str,
        end: str,
    ) -> BacktestResult:
        df = self._fetcher.get_history(symbol, start, end)

        capital = self.initial_capital
        position: Optional[dict] = None
        trades: list[Trade] = []
        equity_curve = [capital]

        # We need at least 2 rows to generate signals
        for i in range(1, len(df)):
            window = df.iloc[: i + 1]
            signal = strategy.generate_signal(symbol, window)
            today = df.index[i]
            price = float(df["Close"].iloc[i])

            # Check stop loss on open position
            if position:
                loss = (price - position["entry_price"]) / position["entry_price"]
                if loss <= -self.stop_loss_pct:
                    pnl = (price - position["entry_price"]) * position["qty"]
                    capital += pnl
                    trades.append(Trade(
                        symbol=symbol,
                        entry_date=position["date"],
                        exit_date=str(today.date()),
                        entry_price=position["entry_price"],
                        exit_price=price,
                        qty=position["qty"],
                        pnl=round(pnl, 2),
                        pnl_pct=round(loss * 100, 2),
                        signal_reason="Stop loss triggered",
                    ))
                    position = None

            # Enter on BUY signal when not in a position
            if signal.signal == SignalType.BUY and not position:
                invest = capital * self.position_pct
                qty = invest / price
                position = {"date": str(today.date()), "entry_price": price, "qty": qty}

            # Exit on SELL signal when in a position
            elif signal.signal == SignalType.SELL and position:
                pnl = (price - position["entry_price"]) * position["qty"]
                pnl_pct = (price - position["entry_price"]) / position["entry_price"] * 100
                capital += pnl
                trades.append(Trade(
                    symbol=symbol,
                    entry_date=position["date"],
                    exit_date=str(today.date()),
                    entry_price=position["entry_price"],
                    exit_price=price,
                    qty=position["qty"],
                    pnl=round(pnl, 2),
                    pnl_pct=round(pnl_pct, 2),
                    signal_reason=signal.reason,
                ))
                position = None

            # Track equity including open position value
            open_value = (price - position["entry_price"]) * position["qty"] if position else 0.0
            equity_curve.append(capital + open_value)

        # Close any open position at the end
        if position:
            price = float(df["Close"].iloc[-1])
            pnl = (price - position["entry_price"]) * position["qty"]
            pnl_pct = (price - position["entry_price"]) / position["entry_price"] * 100
            capital += pnl
            trades.append(Trade(
                symbol=symbol,
                entry_date=position["date"],
                exit_date=str(df.index[-1].date()),
                entry_price=position["entry_price"],
                exit_price=price,
                qty=position["qty"],
                pnl=round(pnl, 2),
                pnl_pct=round(pnl_pct, 2),
                signal_reason="End of backtest period",
            ))

        # Compute stats
        closed = [t for t in trades if t.pnl is not None]
        wins = [t for t in closed if (t.pnl or 0) > 0]
        losses = [t for t in closed if (t.pnl or 0) <= 0]
        win_rate = len(wins) / len(closed) * 100 if closed else 0.0
        avg_gain = np.mean([t.pnl_pct for t in wins]) if wins else 0.0
        avg_loss = np.mean([t.pnl_pct for t in losses]) if losses else 0.0

        # Max drawdown from equity curve
        eq = np.array(equity_curve)
        peak = np.maximum.accumulate(eq)
        drawdowns = (eq - peak) / peak * 100
        max_drawdown = float(np.min(drawdowns))

        final_value = capital
        total_return = (final_value - self.initial_capital) / self.initial_capital * 100

        return BacktestResult(
            symbol=symbol,
            strategy=strategy.__class__.__name__,
            start_date=start,
            end_date=end,
            initial_capital=self.initial_capital,
            final_value=round(final_value, 2),
            total_return_pct=round(total_return, 2),
            win_rate_pct=round(win_rate, 1),
            num_trades=len(closed),
            num_wins=len(wins),
            num_losses=len(losses),
            max_drawdown_pct=round(max_drawdown, 2),
            avg_gain_pct=round(float(avg_gain), 2),
            avg_loss_pct=round(float(avg_loss), 2),
            trades=trades,
        )
