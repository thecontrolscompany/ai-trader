"""
Historical dataset generator.

Creates a feature-and-label table from Yahoo Finance OHLCV history so the team can
train or evaluate a separate ranking model later.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from src.market_data.fetcher import MarketDataFetcher


OUTPUT_DIR = Path("output")


@dataclass
class DatasetSummary:
    rows: int
    symbols: int
    path: str


def _ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _rsi(closes: pd.Series, period: int = 14) -> pd.Series:
    delta = closes.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["return_5d"] = out["Close"].pct_change(5) * 100
    out["return_20d"] = out["Close"].pct_change(20) * 100
    out["return_60d"] = out["Close"].pct_change(60) * 100
    out["sma_20"] = out["Close"].rolling(20).mean()
    out["sma_50"] = out["Close"].rolling(50).mean()
    out["sma_200"] = out["Close"].rolling(200).mean()
    out["gap_sma_20_pct"] = (out["Close"] / out["sma_20"] - 1) * 100
    out["gap_sma_50_pct"] = (out["Close"] / out["sma_50"] - 1) * 100
    out["gap_sma_200_pct"] = (out["Close"] / out["sma_200"] - 1) * 100
    out["rsi_14"] = _rsi(out["Close"], 14)
    out["vol_avg_20"] = out["Volume"].rolling(20).mean()
    out["vol_ratio_20"] = out["Volume"] / out["vol_avg_20"]
    out["daily_return"] = out["Close"].pct_change()
    out["volatility_20"] = out["daily_return"].rolling(20).std() * 100
    out["high_52w"] = out["High"].rolling(252, min_periods=20).max()
    out["low_52w"] = out["Low"].rolling(252, min_periods=20).min()
    out["distance_from_52w_high_pct"] = (out["high_52w"] - out["Close"]) / out["high_52w"] * 100
    out["distance_from_52w_low_pct"] = (out["Close"] - out["low_52w"]) / out["low_52w"] * 100
    return out


def build_symbol_dataset(symbol: str, df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    features = _feature_frame(df)
    records: list[dict[str, object]] = []
    horizons = (5, 20, 60)
    max_horizon = max(horizons)

    for idx in range(len(df) - max_horizon):
        row = features.iloc[idx]
        if pd.isna(row["return_20d"]) or pd.isna(row["sma_50"]) or pd.isna(row["rsi_14"]):
          continue

        close = float(df["Close"].iloc[idx])
        record: dict[str, object] = {
            "symbol": symbol.upper(),
            "date": df.index[idx],
            "close": close,
            "volume": float(df["Volume"].iloc[idx]),
            "return_5d": row["return_5d"],
            "return_20d": row["return_20d"],
            "return_60d": row["return_60d"],
            "sma_20": row["sma_20"],
            "sma_50": row["sma_50"],
            "sma_200": row["sma_200"],
            "gap_sma_20_pct": row["gap_sma_20_pct"],
            "gap_sma_50_pct": row["gap_sma_50_pct"],
            "gap_sma_200_pct": row["gap_sma_200_pct"],
            "rsi_14": row["rsi_14"],
            "vol_avg_20": row["vol_avg_20"],
            "vol_ratio_20": row["vol_ratio_20"],
            "volatility_20": row["volatility_20"],
            "high_52w": row["high_52w"],
            "low_52w": row["low_52w"],
            "distance_from_52w_high_pct": row["distance_from_52w_high_pct"],
            "distance_from_52w_low_pct": row["distance_from_52w_low_pct"],
        }

        for horizon in horizons:
            future_close = float(df["Close"].iloc[idx + horizon])
            future_window = df.iloc[idx + 1: idx + horizon + 1]
            record[f"forward_return_{horizon}d"] = (future_close / close - 1) * 100
            record[f"max_favorable_{horizon}d"] = (float(future_window["High"].max()) / close - 1) * 100
            record[f"max_adverse_{horizon}d"] = (float(future_window["Low"].min()) / close - 1) * 100
            record[f"label_up_{horizon}d"] = future_close > close
            record[f"label_up_5pct_{horizon}d"] = (future_close / close - 1) >= 0.05
            record[f"label_down_5pct_{horizon}d"] = (future_close / close - 1) <= -0.05

        records.append(record)

    data = pd.DataFrame.from_records(records)
    return data


def generate_training_dataset(
    symbols: Iterable[str],
    start_date: str,
    end_date: str,
    buffer_days: int = 365,
) -> DatasetSummary:
    _ensure_output_dir()
    fetcher = MarketDataFetcher()
    start_ts = pd.Timestamp(start_date)
    buffered_start = (start_ts - pd.Timedelta(days=buffer_days)).strftime("%Y-%m-%d")
    end_ts = pd.Timestamp(end_date)

    frames: list[pd.DataFrame] = []
    symbols = [s.strip().upper() for s in symbols if s and s.strip()]

    for symbol in symbols:
        try:
            df = fetcher.get_history(symbol, buffered_start, end_date)
        except Exception:
            continue

        dataset = build_symbol_dataset(symbol, df)
        if dataset.empty:
            continue
        dataset["date"] = pd.to_datetime(dataset["date"])
        dataset = dataset[(dataset["date"] >= start_ts) & (dataset["date"] <= end_ts)]
        frames.append(dataset)

    if not frames:
        raise ValueError("No dataset rows could be generated from the supplied symbols and date range.")

    combined = pd.concat(frames, ignore_index=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"training_dataset_{ts}.csv"
    combined.to_csv(path, index=False)

    return DatasetSummary(
        rows=len(combined),
        symbols=len(set(combined["symbol"])),
        path=str(path),
    )
