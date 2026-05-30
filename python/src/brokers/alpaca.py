"""
Alpaca Paper Trading client.

Setup:
  1. Create a free account at https://app.alpaca.markets
  2. Switch to the Paper Trading environment
  3. Generate API keys under API Keys section
  4. Add ALPACA_API_KEY, ALPACA_SECRET_KEY to your .env
     ALPACA_BASE_URL must stay as https://paper-api.alpaca.markets

Alpaca paper trading is free and mirrors real market conditions.
"""
import os
from typing import Optional

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce, QueryOrderStatus

from .base import BrokerClient, Position, Order, AccountInfo


class AlpacaPaperClient(BrokerClient):
    """
    Alpaca paper trading implementation.
    All orders go to the paper environment — no real money is ever used.
    """

    def __init__(self):
        api_key = os.getenv("ALPACA_API_KEY")
        secret_key = os.getenv("ALPACA_SECRET_KEY")
        if not api_key or not secret_key:
            raise EnvironmentError(
                "ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in your .env file.\n"
                "Get them from https://app.alpaca.markets (Paper account → API Keys)."
            )
        # paper=True ensures we NEVER touch real money
        self._client = TradingClient(api_key, secret_key, paper=True)

    def get_account(self) -> AccountInfo:
        acct = self._client.get_account()
        equity = float(acct.equity)
        last_equity = float(acct.last_equity)
        day_pnl = equity - last_equity
        day_pnl_pct = (day_pnl / last_equity * 100) if last_equity else 0.0
        return AccountInfo(
            cash=float(acct.cash),
            portfolio_value=float(acct.portfolio_value),
            buying_power=float(acct.buying_power),
            equity=equity,
            day_pnl=day_pnl,
            day_pnl_pct=day_pnl_pct,
        )

    def get_positions(self) -> list[Position]:
        positions = self._client.get_all_positions()
        return [
            Position(
                symbol=p.symbol,
                qty=float(p.qty),
                avg_entry_price=float(p.avg_entry_price),
                current_price=float(p.current_price),
                unrealized_pnl=float(p.unrealized_pl),
                unrealized_pnl_pct=float(p.unrealized_plpc) * 100,
            )
            for p in positions
        ]

    def place_order(
        self,
        symbol: str,
        side: str,
        qty: float,
        order_type: str = "market",
        limit_price: Optional[float] = None,
    ) -> Order:
        alpaca_side = OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL

        if order_type == "limit" and limit_price:
            req = LimitOrderRequest(
                symbol=symbol,
                qty=qty,
                side=alpaca_side,
                time_in_force=TimeInForce.DAY,
                limit_price=limit_price,
            )
        else:
            req = MarketOrderRequest(
                symbol=symbol,
                qty=qty,
                side=alpaca_side,
                time_in_force=TimeInForce.DAY,
            )

        o = self._client.submit_order(req)
        return Order(
            id=str(o.id),
            symbol=o.symbol,
            side=o.side.value,
            qty=float(o.qty),
            order_type=o.order_type.value,
            status=o.status.value,
            filled_avg_price=float(o.filled_avg_price) if o.filled_avg_price else None,
        )

    def cancel_order(self, order_id: str) -> bool:
        try:
            self._client.cancel_order_by_id(order_id)
            return True
        except Exception:
            return False

    def get_orders(self, status: str = "open") -> list[Order]:
        status_map = {
            "open": QueryOrderStatus.OPEN,
            "closed": QueryOrderStatus.CLOSED,
            "all": QueryOrderStatus.ALL,
        }
        orders = self._client.get_orders(filter=None)
        return [
            Order(
                id=str(o.id),
                symbol=o.symbol,
                side=o.side.value,
                qty=float(o.qty),
                order_type=o.order_type.value,
                status=o.status.value,
                filled_avg_price=float(o.filled_avg_price) if o.filled_avg_price else None,
            )
            for o in orders
        ]
