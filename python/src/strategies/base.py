from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
import pandas as pd


class SignalType(Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class Signal:
    symbol: str
    signal: SignalType
    reason: str          # Plain-English explanation
    confidence: float    # 0.0 – 1.0
    strategy: str        # Strategy name


class Strategy(ABC):
    """Base class for all trading strategies. Returns research signals only."""

    @abstractmethod
    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal:
        """
        Analyze price data and return a BUY / SELL / HOLD signal.
        This is a RESEARCH signal only — it never places a trade automatically.
        """
