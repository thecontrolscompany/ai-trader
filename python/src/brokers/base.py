"""
Broker abstraction layer.
All broker clients must implement BrokerClient so the rest of the app
never depends on a specific broker's SDK.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class Position:
    symbol: str
    qty: float
    avg_entry_price: float
    current_price: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


@dataclass
class Order:
    id: str
    symbol: str
    side: str        # "buy" | "sell"
    qty: float
    order_type: str  # "market" | "limit"
    status: str
    filled_avg_price: Optional[float] = None


@dataclass
class AccountInfo:
    cash: float
    portfolio_value: float
    buying_power: float
    equity: float
    day_pnl: float
    day_pnl_pct: float


class BrokerClient(ABC):
    """Abstract base class every broker must implement."""

    @abstractmethod
    def get_account(self) -> AccountInfo:
        """Return current account balances and P&L."""

    @abstractmethod
    def get_positions(self) -> list[Position]:
        """Return all open positions."""

    @abstractmethod
    def place_order(
        self,
        symbol: str,
        side: str,
        qty: float,
        order_type: str = "market",
        limit_price: Optional[float] = None,
    ) -> Order:
        """
        Place a paper trade order.
        side: "buy" or "sell"
        order_type: "market" or "limit"
        """

    @abstractmethod
    def cancel_order(self, order_id: str) -> bool:
        """Cancel an open order. Returns True if successful."""

    @abstractmethod
    def get_orders(self, status: str = "open") -> list[Order]:
        """Return orders filtered by status: 'open' | 'closed' | 'all'."""
