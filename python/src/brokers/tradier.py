"""
Tradier Broker Client — SCAFFOLDED, NOT YET ACTIVE.

When ready to set up:
  1. Open a brokerage account at https://brokerage.tradier.com
     (commission-free equities + options, free real-time streaming data)
  2. Go to your account → API Access → Generate Access Token
  3. Add to .env:
       TRADIER_ACCESS_TOKEN=your_token_here
       TRADIER_ACCOUNT_ID=your_account_id_here
       TRADIER_SANDBOX=true          # set to false for live trading
  4. Sandbox base URL:  https://sandbox.tradier.com/v1
     Live base URL:     https://api.tradier.com/v1

Key advantages over Alpaca:
  - Free real-time streaming quotes included with any brokerage account
  - Strong options trading API (greeks, chains, complex spreads)
  - No per-share fees on equities
  - WebSocket streaming via https://stream.tradier.com

Required package (add to requirements.txt when activating):
  requests>=2.31.0  (already installed)

Official docs: https://documentation.tradier.com
"""

import os
from typing import Optional
from .base import BrokerClient, Position, Order, AccountInfo


class TradierClient(BrokerClient):
    """
    Tradier broker implementation.
    Scaffold only — raises NotImplementedError until credentials are configured.
    Set TRADIER_ACCESS_TOKEN and TRADIER_ACCOUNT_ID in .env to activate.
    """

    BASE_URL_SANDBOX = "https://sandbox.tradier.com/v1"
    BASE_URL_LIVE    = "https://api.tradier.com/v1"

    def __init__(self):
        self.token      = os.getenv("TRADIER_ACCESS_TOKEN")
        self.account_id = os.getenv("TRADIER_ACCOUNT_ID")
        self.sandbox    = os.getenv("TRADIER_SANDBOX", "true").lower() == "true"
        self.base_url   = self.BASE_URL_SANDBOX if self.sandbox else self.BASE_URL_LIVE

        if not self.token or not self.account_id:
            raise EnvironmentError(
                "\nTradier is not yet configured.\n"
                "Add these to your .env file:\n"
                "  TRADIER_ACCESS_TOKEN=your_token\n"
                "  TRADIER_ACCOUNT_ID=your_account_id\n"
                "  TRADIER_SANDBOX=true\n\n"
                "See python/src/brokers/tradier.py for setup instructions."
            )

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }

    def get_account(self) -> AccountInfo:
        raise NotImplementedError("Tradier: get_account() not yet implemented.")

    def get_positions(self) -> list[Position]:
        raise NotImplementedError("Tradier: get_positions() not yet implemented.")

    def place_order(
        self,
        symbol: str,
        side: str,
        qty: float,
        order_type: str = "market",
        limit_price: Optional[float] = None,
    ) -> Order:
        raise NotImplementedError("Tradier: place_order() not yet implemented.")

    def cancel_order(self, order_id: str) -> bool:
        raise NotImplementedError("Tradier: cancel_order() not yet implemented.")

    def get_orders(self, status: str = "open") -> list[Order]:
        raise NotImplementedError("Tradier: get_orders() not yet implemented.")
