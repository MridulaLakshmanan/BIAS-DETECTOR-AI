"""
Bias scorer — aggregates attribute and proxy findings into a 0–100 bias score.
"""

from typing import List, Dict, Any


# Weight by sensitivity of attribute
ATTRIBUTE_WEIGHTS: Dict[str, float] = {
    "race": 1.0,
    "gender": 0.95,
    "age": 0.85,
    "national_origin": 1.0,
    "religion": 0.90,
    "disability": 0.90,
    "socioeconomic": 0.80,
    "family_status": 0.75,
}

PROXY_BASE_WEIGHT = 0.60


def calculate_input_bias_score(
    attributes: List[Dict[str, Any]],
    proxies: List[Dict[str, Any]],
) -> float:
    """
    Calculate a 0–100 bias probability score from detected attributes and proxies.
    """
    if not attributes and not proxies:
        return 0.0

    total = 0.0
    count = 0

    for attr in attributes:
        name = attr.get("attribute", "")
        confidence = attr.get("confidence", 0.5)
        weight = ATTRIBUTE_WEIGHTS.get(name, 0.70)
        total += confidence * weight * 100
        count += 1

    for proxy in proxies:
        proxy_confidence = proxy.get("confidence", 0.5)
        total += proxy_confidence * PROXY_BASE_WEIGHT * 100
        count += 1

    if count == 0:
        return 0.0

    raw = total / count
    # Boost when multiple signals detected
    boost = min((len(attributes) + len(proxies) - 1) * 5, 20)
    score = min(raw + boost, 100.0)
    return round(score, 2)
