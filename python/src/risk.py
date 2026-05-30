"""
Risk management checks.
These are guardrails — they flag if a proposed trade violates configured limits.
"""
from dataclasses import dataclass
from src.brokers.base import AccountInfo


@dataclass
class RiskCheck:
    passed: bool
    reason: str


def check_risk(
    account: AccountInfo,
    qty: float,
    price: float,
    config: dict,
) -> RiskCheck:
    risk_cfg = config.get("risk", {})
    max_pos_pct = risk_cfg.get("max_position_pct", 0.05)
    max_daily_loss_pct = risk_cfg.get("max_daily_loss_pct", 0.02)

    # Check daily loss limit
    daily_loss_pct = abs(account.day_pnl_pct) / 100
    if account.day_pnl < 0 and daily_loss_pct >= max_daily_loss_pct:
        return RiskCheck(
            passed=False,
            reason=f"Daily loss limit reached ({account.day_pnl_pct:.2f}%). No more trades today.",
        )

    # Check position size
    trade_value = qty * price
    position_pct = trade_value / account.portfolio_value if account.portfolio_value else 0
    if position_pct > max_pos_pct:
        return RiskCheck(
            passed=False,
            reason=(
                f"Position size {position_pct:.1%} exceeds max {max_pos_pct:.1%}. "
                f"Reduce qty to {int(account.portfolio_value * max_pos_pct / price)} shares or less."
            ),
        )

    return RiskCheck(passed=True, reason="Risk checks passed.")
