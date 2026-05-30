"""
AI analysis module.
Uses the same Claude/OpenAI providers as the Tim & Shane web app.

IMPORTANT:
- The AI is advisory only. It explains what the data means in plain English.
- It never places trades or makes final decisions.
- All output is labeled "NOT FINANCIAL ADVICE".
"""
import os
from dataclasses import dataclass
from typing import Optional

from src.market_data.fetcher import Quote
from src.strategies.base import Signal


@dataclass
class AIAnalysis:
    symbol: str
    model: str
    summary: str           # Plain-English market summary
    recommendation: str    # "BUY" | "SELL" | "HOLD" | "RESEARCH MORE"
    confidence: float      # 0.0 – 1.0
    reasoning: str         # Beginner-friendly explanation
    key_points: list[str]  # Bullet points
    disclaimer: str = "⚠️  NOT FINANCIAL ADVICE. Paper trading research only."


SYSTEM_PROMPT = """You are a friendly stock market educator helping beginners understand stocks.
You explain things in simple, plain English — no jargon without explanation.
You never tell anyone what to do with real money.
You always clarify this is educational research, not financial advice.
You respond ONLY with valid JSON."""


def _build_prompt(quote: Quote, signals: list[Signal]) -> str:
    signal_lines = "\n".join(
        f"  - {s.strategy}: {s.signal.value} (confidence {s.confidence:.0%}) — {s.reason}"
        for s in signals
    )
    pct_from_high = ((quote.price - (quote.week_high_52 or quote.price)) / (quote.week_high_52 or quote.price) * 100) if quote.week_high_52 else None
    pct_from_low = ((quote.price - (quote.week_low_52 or quote.price)) / (quote.week_low_52 or quote.price) * 100) if quote.week_low_52 else None

    return f"""Analyze this stock for a complete beginner. Be encouraging but honest.

Symbol: {quote.symbol} ({quote.name})
Current Price: ${quote.price:.2f} (changed {quote.change_pct:+.2f}% today)
P/E Ratio: {quote.pe_ratio or "N/A"}
EPS: {f"${quote.eps:.2f}" if quote.eps else "N/A"}
Beta: {quote.beta or "N/A"}
Market Cap: {f"${quote.market_cap/1e9:.1f}B" if quote.market_cap else "N/A"}
52-Week High: {f"${quote.week_high_52:.2f}" if quote.week_high_52 else "N/A"} ({f"{pct_from_high:.1f}% from high" if pct_from_high else ""})
52-Week Low: {f"${quote.week_low_52:.2f}" if quote.week_low_52 else "N/A"} ({f"+{pct_from_low:.1f}% from low" if pct_from_low else ""})

Strategy signals:
{signal_lines if signals else "  (no signals generated)"}

Return ONLY this JSON:
{{
  "summary": "2-3 sentences describing what this stock is doing right now, in plain English",
  "recommendation": "BUY | SELL | HOLD | RESEARCH MORE",
  "confidence": 0.0,
  "reasoning": "Explain your recommendation in plain English for someone who has never invested. What does each metric mean? Why does it matter?",
  "key_points": [
    "Point 1 — explain a metric in plain English",
    "Point 2",
    "Point 3"
  ]
}}"""


def _call_claude(prompt: str) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    text = "".join(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def _call_openai(prompt: str) -> dict:
    from openai import OpenAI
    import json
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return json.loads(response.choices[0].message.content)


class AIAnalyst:
    """Advisory AI analysis — explains stock data in plain English. Never places trades."""

    def __init__(self, provider: str = "claude"):
        self.provider = provider.lower()
        if self.provider == "claude" and not os.getenv("ANTHROPIC_API_KEY"):
            raise EnvironmentError("ANTHROPIC_API_KEY not set in .env")
        if self.provider == "openai" and not os.getenv("OPENAI_API_KEY"):
            raise EnvironmentError("OPENAI_API_KEY not set in .env")

    def analyze(self, quote: Quote, signals: Optional[list[Signal]] = None) -> AIAnalysis:
        prompt = _build_prompt(quote, signals or [])
        result = _call_claude(prompt) if self.provider == "claude" else _call_openai(prompt)
        model_name = "Claude Sonnet 4.6" if self.provider == "claude" else "GPT-4o"

        return AIAnalysis(
            symbol=quote.symbol,
            model=model_name,
            summary=result.get("summary", ""),
            recommendation=result.get("recommendation", "HOLD"),
            confidence=float(result.get("confidence", 0.5)),
            reasoning=result.get("reasoning", ""),
            key_points=result.get("key_points", []),
        )
