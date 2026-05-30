"""
Market data fetcher using yfinance (Yahoo Finance).
Same data source as the Tim & Shane Stocks web app.
Data is delayed ~15 minutes — suitable for paper trading research, not HFT.
"""
import yfinance as yf
import pandas as pd
from dataclasses import dataclass
from typing import Optional


@dataclass
class Quote:
    symbol: str
    price: float
    change: float
    change_pct: float
    volume: int
    avg_volume: int
    market_cap: Optional[float]
    pe_ratio: Optional[float]
    eps: Optional[float]
    beta: Optional[float]
    week_high_52: Optional[float]
    week_low_52: Optional[float]
    name: str


class MarketDataFetcher:
    """Fetches price quotes and historical OHLCV data via yfinance."""

    def get_quote(self, symbol: str) -> Quote:
        """Get the latest quote for a single symbol."""
        ticker = yf.Ticker(symbol)
        info = ticker.info

        price = info.get("regularMarketPrice") or info.get("currentPrice") or 0.0
        prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or price
        change = price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0.0

        return Quote(
            symbol=symbol.upper(),
            name=info.get("shortName") or info.get("longName") or symbol,
            price=round(price, 2),
            change=round(change, 2),
            change_pct=round(change_pct, 2),
            volume=info.get("regularMarketVolume") or 0,
            avg_volume=info.get("averageVolume") or info.get("averageDailyVolume10Day") or 0,
            market_cap=info.get("marketCap"),
            pe_ratio=info.get("trailingPE"),
            eps=info.get("trailingEps"),
            beta=info.get("beta"),
            week_high_52=info.get("fiftyTwoWeekHigh"),
            week_low_52=info.get("fiftyTwoWeekLow"),
        )

    def get_quotes(self, symbols: list[str]) -> list[Quote]:
        """Get quotes for a list of symbols."""
        return [self.get_quote(s) for s in symbols]

    def get_history(
        self,
        symbol: str,
        start: str,
        end: str,
        interval: str = "1d",
    ) -> pd.DataFrame:
        """
        Fetch OHLCV history for backtesting.

        Args:
            symbol:   Ticker symbol e.g. "AAPL"
            start:    Start date "YYYY-MM-DD"
            end:      End date "YYYY-MM-DD"
            interval: "1d", "1wk", "1mo"

        Returns:
            DataFrame with columns: Open, High, Low, Close, Volume
        """
        df = yf.download(symbol, start=start, end=end, interval=interval, progress=False)
        if df.empty:
            raise ValueError(f"No data returned for {symbol} ({start} → {end})")
        # Flatten multi-level columns if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.index = pd.to_datetime(df.index)
        return df[["Open", "High", "Low", "Close", "Volume"]].copy()
