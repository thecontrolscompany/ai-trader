"""
Lightweight ranking model for stock setups.

Trains a simple logistic regression on the historical dataset exported by the
dataset generator. The goal is to rank setups by likelihood of a positive
forward outcome, not to predict exact prices.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable
import json
import math

import numpy as np
import pandas as pd


OUTPUT_DIR = Path("output")
RANKER_MODEL_PATH = OUTPUT_DIR / "ranker_model.json"
DEFAULT_DATASET_GLOB = "training_dataset_*.csv"
DEFAULT_TARGET_COLUMN = "label_up_5pct_20d"

FEATURE_COLUMNS = [
    "return_5d",
    "return_20d",
    "return_60d",
    "sma_20",
    "sma_50",
    "sma_200",
    "gap_sma_20_pct",
    "gap_sma_50_pct",
    "gap_sma_200_pct",
    "rsi_14",
    "vol_avg_20",
    "vol_ratio_20",
    "volatility_20",
    "distance_from_52w_high_pct",
    "distance_from_52w_low_pct",
]


@dataclass
class RankerMetrics:
    samples: int
    train_samples: int
    val_samples: int
    train_accuracy: float
    val_accuracy: float
    train_auc: float | None
    val_auc: float | None
    train_positive_rate: float
    val_positive_rate: float


@dataclass
class RankerModel:
    feature_columns: list[str]
    weights: list[float]
    bias: float
    feature_means: list[float]
    feature_stds: list[float]
    target_column: str = DEFAULT_TARGET_COLUMN
    threshold: float = 0.5
    metrics: RankerMetrics | None = None

    def to_dict(self) -> dict:
        data = asdict(self)
        if self.metrics is not None:
            data["metrics"] = asdict(self.metrics)
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "RankerModel":
        metrics = data.get("metrics")
        return cls(
            feature_columns=list(data["feature_columns"]),
            weights=list(data["weights"]),
            bias=float(data["bias"]),
            feature_means=list(data["feature_means"]),
            feature_stds=list(data["feature_stds"]),
            target_column=str(data.get("target_column", DEFAULT_TARGET_COLUMN)),
            threshold=float(data.get("threshold", 0.5)),
            metrics=RankerMetrics(**metrics) if metrics else None,
        )

    def _prepare_matrix(self, df: pd.DataFrame) -> np.ndarray:
        data = df.reindex(columns=self.feature_columns).astype(float).copy()
        for idx, col in enumerate(self.feature_columns):
            data[col] = data[col].fillna(self.feature_means[idx])
        matrix = data.to_numpy(dtype=float)
        stds = np.array(self.feature_stds, dtype=float)
        means = np.array(self.feature_means, dtype=float)
        stds = np.where(stds == 0, 1.0, stds)
        return (matrix - means) / stds

    def predict_proba(self, df: pd.DataFrame) -> np.ndarray:
        if df.empty:
            return np.array([])
        x = self._prepare_matrix(df)
        w = np.array(self.weights, dtype=float)
        logits = x @ w + float(self.bias)
        logits = np.clip(logits, -35, 35)
        return 1.0 / (1.0 + np.exp(-logits))

    def rank(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df.copy()
        ranked = df.copy()
        ranked["rank_score"] = self.predict_proba(ranked)
        return ranked.sort_values("rank_score", ascending=False).reset_index(drop=True)


def _ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _latest_dataset_path() -> Path:
    datasets = sorted(OUTPUT_DIR.glob(DEFAULT_DATASET_GLOB), key=lambda p: p.stat().st_mtime, reverse=True)
    if not datasets:
        raise FileNotFoundError("No training dataset found in output/. Run the dataset generator first.")
    return datasets[0]


def _sigmoid(z: np.ndarray) -> np.ndarray:
    z = np.clip(z, -35, 35)
    return 1.0 / (1.0 + np.exp(-z))


def _auc_score(y_true: np.ndarray, y_score: np.ndarray) -> float | None:
    positives = y_true == 1
    negatives = y_true == 0
    pos_count = int(positives.sum())
    neg_count = int(negatives.sum())
    if pos_count == 0 or neg_count == 0:
        return None

    order = np.argsort(y_score)
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(1, len(y_score) + 1)
    rank_sum = float(ranks[positives].sum())
    auc = (rank_sum - pos_count * (pos_count + 1) / 2) / (pos_count * neg_count)
    return float(auc)


def _accuracy(y_true: np.ndarray, y_score: np.ndarray, threshold: float = 0.5) -> float:
    preds = (y_score >= threshold).astype(int)
    return float((preds == y_true).mean())


def _prepare_frame(df: pd.DataFrame, target_column: str) -> pd.DataFrame:
    missing = [col for col in FEATURE_COLUMNS + [target_column] if col not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing)}")

    frame = df.copy()
    frame = frame.dropna(subset=FEATURE_COLUMNS + [target_column])
    if "date" in frame.columns:
        frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
        frame = frame.sort_values("date")
    return frame.reset_index(drop=True)


def _split_frame(df: pd.DataFrame, val_fraction: float = 0.2) -> tuple[pd.DataFrame, pd.DataFrame]:
    if len(df) < 20:
        raise ValueError("Need at least 20 samples to train the ranker.")

    split_idx = max(1, int(len(df) * (1 - val_fraction)))
    train = df.iloc[:split_idx].reset_index(drop=True)
    val = df.iloc[split_idx:].reset_index(drop=True)
    if val.empty:
        val = train.tail(max(1, len(train) // 5)).copy().reset_index(drop=True)
        train = train.iloc[: len(train) - len(val)].copy().reset_index(drop=True)
    return train, val


def _standardize_train(x: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    means = np.nanmean(x, axis=0)
    stds = np.nanstd(x, axis=0)
    stds = np.where(stds == 0, 1.0, stds)
    return (x - means) / stds, means, stds


def _log_loss(y_true: np.ndarray, y_prob: np.ndarray, sample_weights: np.ndarray | None = None) -> float:
    y_prob = np.clip(y_prob, 1e-8, 1 - 1e-8)
    losses = -(y_true * np.log(y_prob) + (1 - y_true) * np.log(1 - y_prob))
    if sample_weights is not None:
      return float(np.average(losses, weights=sample_weights))
    return float(losses.mean())


def _train_logistic_regression(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    learning_rate: float = 0.05,
    epochs: int = 600,
    l2: float = 0.001,
) -> tuple[np.ndarray, float, dict[str, float]]:
    weights = np.zeros(x_train.shape[1], dtype=float)
    bias = 0.0

    positives = float((y_train == 1).sum())
    negatives = float((y_train == 0).sum())
    pos_weight = negatives / positives if positives > 0 else 1.0
    sample_weights = np.where(y_train == 1, pos_weight, 1.0)

    for _ in range(epochs):
        logits = x_train @ weights + bias
        probs = _sigmoid(logits)
        errors = probs - y_train
        weighted_errors = errors * sample_weights
        scale = float(sample_weights.sum())
        grad_w = (x_train.T @ weighted_errors) / scale + l2 * weights
        grad_b = weighted_errors.sum() / scale
        weights -= learning_rate * grad_w
        bias -= learning_rate * grad_b

    train_probs = _sigmoid(x_train @ weights + bias)
    val_probs = _sigmoid(x_val @ weights + bias)
    metrics = {
        "train_loss": _log_loss(y_train, train_probs, sample_weights),
        "val_loss": _log_loss(y_val, val_probs) if len(y_val) else math.nan,
        "train_accuracy": _accuracy(y_train, train_probs),
        "val_accuracy": _accuracy(y_val, val_probs) if len(y_val) else math.nan,
    }
    return weights, bias, metrics


def train_ranker_from_dataset(
    dataset: pd.DataFrame,
    target_column: str = DEFAULT_TARGET_COLUMN,
    val_fraction: float = 0.2,
) -> tuple[RankerModel, RankerMetrics]:
    frame = _prepare_frame(dataset, target_column)
    train_df, val_df = _split_frame(frame, val_fraction=val_fraction)

    x_train_raw = train_df[FEATURE_COLUMNS].to_numpy(dtype=float)
    x_val_raw = val_df[FEATURE_COLUMNS].to_numpy(dtype=float) if len(val_df) else np.empty((0, len(FEATURE_COLUMNS)))
    y_train = train_df[target_column].astype(int).to_numpy()
    y_val = val_df[target_column].astype(int).to_numpy() if len(val_df) else np.array([], dtype=int)

    x_train, means, stds = _standardize_train(x_train_raw)
    x_val = (x_val_raw - means) / stds if len(x_val_raw) else x_val_raw

    weights, bias, _ = _train_logistic_regression(x_train, y_train, x_val, y_val)

    train_probs = _sigmoid(x_train @ weights + bias)
    val_probs = _sigmoid(x_val @ weights + bias) if len(x_val) else np.array([])

    metrics = RankerMetrics(
        samples=len(frame),
        train_samples=len(train_df),
        val_samples=len(val_df),
        train_accuracy=_accuracy(y_train, train_probs),
        val_accuracy=_accuracy(y_val, val_probs) if len(y_val) else 0.0,
        train_auc=_auc_score(y_train, train_probs),
        val_auc=_auc_score(y_val, val_probs) if len(y_val) else None,
        train_positive_rate=float(y_train.mean()) if len(y_train) else 0.0,
        val_positive_rate=float(y_val.mean()) if len(y_val) else 0.0,
    )

    model = RankerModel(
        feature_columns=FEATURE_COLUMNS,
        weights=weights.tolist(),
        bias=float(bias),
        feature_means=means.tolist(),
        feature_stds=stds.tolist(),
        target_column=target_column,
        threshold=0.5,
        metrics=metrics,
    )
    return model, metrics


def train_latest_ranker(
    target_column: str = DEFAULT_TARGET_COLUMN,
    dataset_path: Path | None = None,
) -> tuple[RankerModel, RankerMetrics, Path]:
    _ensure_output_dir()
    source = Path(dataset_path) if dataset_path else _latest_dataset_path()
    dataset = pd.read_csv(source)
    model, metrics = train_ranker_from_dataset(dataset, target_column=target_column)
    with open(RANKER_MODEL_PATH, "w", encoding="utf-8") as f:
        json.dump(model.to_dict(), f, indent=2)
    return model, metrics, source


def load_ranker(path: Path | None = None) -> RankerModel:
    model_path = Path(path) if path else RANKER_MODEL_PATH
    with open(model_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return RankerModel.from_dict(payload)


def rank_dataframe(df: pd.DataFrame, model: RankerModel | None = None) -> pd.DataFrame:
    model = model or load_ranker()
    return model.rank(df)
