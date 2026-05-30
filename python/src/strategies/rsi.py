"""
RSI (Relative Strength Index) Strategy.

How it works (plain English):
  - RSI measures how fast a stock's price has been moving up vs. down, on a scale of 0–100.
  - RSI < 30 → "oversold" — the stock may have been sold too aggressively → possible BUY.
  - RSI > 70 → "overbought" — the stock may have been bought too aggressively → possible SELL.
  - Between 30–70 → HOLD — no strong signal.

RSI is best used alongside price trend analysis, not on its own.
"""
import pandas as pd
import numpy as np
from .base import Strategy, Signal, SignalType


class RSIStrategy(Strategy):

    def __init__(self, period: int = 14, oversold: float = 30, overbought: float = 70):
        self.period = period
        self.oversold = oversold
        self.overbought = overbought

    def _calc_rsi(self, closes: pd.Series) -> pd.Series:
        delta = closes.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(com=self.period - 1, min_periods=self.period).mean()
        avg_loss = loss.ewm(com=self.period - 1, min_periods=self.period).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal:
        if len(df) < self.period + 1:
            return Signal(
                symbol=symbol,
                signal=SignalType.HOLD,
                reason=f"Not enough data for RSI-{self.period}.",
                confidence=0.0,
                strategy="RSI",
            )

        rsi_series = self._calc_rsi(df["Close"])
        rsi = float(rsi_series.iloc[-1])
        price = float(df["Close"].iloc[-1])

        if rsi < self.oversold:
            # More oversold = higher confidence
            confidence = round(min(0.5 + (self.oversold - rsi) / self.oversold, 0.90), 2)
            return Signal(
                symbol=symbol,
                signal=SignalType.BUY,
                reason=(
                    f"RSI is {rsi:.1f} — below {self.oversold} (oversold zone). "
                    f"This means the stock has been sold heavily and may bounce back. "
                    f"Current price: ${price:.2f}."
                ),
                confidence=confidence,
                strategy="RSI",
            )

        if rsi > self.overbought:
            confidence = round(min(0.5 + (rsi - self.overbought) / (100 - self.overbought), 0.90), 2)
            return Signal(
                symbol=symbol,
                signal=SignalType.SELL,
                reason=(
                    f"RSI is {rsi:.1f} — above {self.overbought} (overbought zone). "
                    f"This means buyers may have pushed the price too high and a pullback is possible. "
                    f"Current price: ${price:.2f}."
                ),
                confidence=confidence,
                strategy="RSI",
            )

        return Signal(
            symbol=symbol,
            signal=SignalType.HOLD,
            reason=f"RSI is {rsi:.1f} — neutral zone ({self.oversold}–{self.overbought}). Price: ${price:.2f}.",
            confidence=0.0,
            strategy="RSI",
        )
