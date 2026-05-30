"""
Simple Moving Average (SMA) Crossover Strategy.

How it works (plain English):
  - Calculate two moving averages: a "fast" one (e.g. 20 days) and a "slow" one (e.g. 50 days).
  - When the fast average crosses ABOVE the slow average → BUY signal (upward momentum).
  - When the fast average crosses BELOW the slow average → SELL signal (downward momentum).
  - Otherwise → HOLD.

This is one of the most widely used beginner strategies.
It works best in trending markets and can give false signals in choppy, sideways markets.
"""
import pandas as pd
from .base import Strategy, Signal, SignalType


class SMACrossoverStrategy(Strategy):

    def __init__(self, short_window: int = 20, long_window: int = 50):
        self.short_window = short_window
        self.long_window = long_window

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal:
        if len(df) < self.long_window + 1:
            return Signal(
                symbol=symbol,
                signal=SignalType.HOLD,
                reason=f"Not enough data (need {self.long_window + 1} days, have {len(df)})",
                confidence=0.0,
                strategy="SMA Crossover",
            )

        df = df.copy()
        df["sma_short"] = df["Close"].rolling(self.short_window).mean()
        df["sma_long"] = df["Close"].rolling(self.long_window).mean()

        prev = df.iloc[-2]
        curr = df.iloc[-1]

        price = float(curr["Close"])
        sma_short = float(curr["sma_short"])
        sma_long = float(curr["sma_long"])
        prev_short = float(prev["sma_short"])
        prev_long = float(prev["sma_long"])

        # Golden cross: short crosses above long
        if prev_short <= prev_long and sma_short > sma_long:
            gap_pct = (sma_short - sma_long) / sma_long
            confidence = min(0.5 + gap_pct * 10, 0.85)
            return Signal(
                symbol=symbol,
                signal=SignalType.BUY,
                reason=(
                    f"Golden cross: {self.short_window}-day SMA (${sma_short:.2f}) just crossed "
                    f"above {self.long_window}-day SMA (${sma_long:.2f}). "
                    f"Current price: ${price:.2f}."
                ),
                confidence=round(confidence, 2),
                strategy="SMA Crossover",
            )

        # Death cross: short crosses below long
        if prev_short >= prev_long and sma_short < sma_long:
            gap_pct = (sma_long - sma_short) / sma_long
            confidence = min(0.5 + gap_pct * 10, 0.85)
            return Signal(
                symbol=symbol,
                signal=SignalType.SELL,
                reason=(
                    f"Death cross: {self.short_window}-day SMA (${sma_short:.2f}) just crossed "
                    f"below {self.long_window}-day SMA (${sma_long:.2f}). "
                    f"Current price: ${price:.2f}."
                ),
                confidence=round(confidence, 2),
                strategy="SMA Crossover",
            )

        # No crossover — determine trend direction for context
        trend = "above" if sma_short > sma_long else "below"
        return Signal(
            symbol=symbol,
            signal=SignalType.HOLD,
            reason=(
                f"No crossover. {self.short_window}-day SMA is {trend} {self.long_window}-day SMA. "
                f"Price: ${price:.2f}."
            ),
            confidence=0.0,
            strategy="SMA Crossover",
        )
