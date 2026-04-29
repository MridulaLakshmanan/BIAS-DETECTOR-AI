"""
Proxy variable detector — identifies proxy variables that correlate with
protected attributes.
"""

import re
from typing import List, Dict, Any

# Proxy → protected attribute mappings
PROXY_RULES = [
    {
        "variable": "zip_code",
        "patterns": [r"\bzip\s*code\b", r"\bpostal\s*code\b", r"\bzip\b\s+\d{5}"],
        "mapped_to": "race/socioeconomic",
        "confidence": 0.80,
    },
    {
        "variable": "university_name",
        "patterns": [
            r"\buniversity\b", r"\bcollege\b", r"\bhbcu\b",
            r"\bivy\s*league\b", r"\bstate\s+school\b",
            r"\bcommunity\s+college\b",
        ],
        "mapped_to": "socioeconomic/race",
        "confidence": 0.70,
    },
    {
        "variable": "employment_gap",
        "patterns": [
            r"\bgap\s+year\b", r"\bemployment\s+gap\b",
            r"\bcareer\s+break\b", r"\bsabbatical\b",
            r"\btime\s+off\b", r"\bmaternity\s+leave\b",
            r"\bparental\s+leave\b",
        ],
        "mapped_to": "gender/family_status",
        "confidence": 0.75,
    },
    {
        "variable": "graduation_year",
        "patterns": [
            r"\bgraduated\s+in\s+\d{4}\b",
            r"\bclass\s+of\s+\d{4}\b",
            r"\bgrad\s+year\b",
        ],
        "mapped_to": "age",
        "confidence": 0.72,
    },
    {
        "variable": "neighborhood",
        "patterns": [
            r"\bneighborhood\b", r"\bdistrict\b", r"\bsuburb\b",
            r"\binner\s*city\b", r"\bgated\s+community\b",
            r"\bpublic\s+housing\b",
        ],
        "mapped_to": "race/socioeconomic",
        "confidence": 0.78,
    },
    {
        "variable": "hobbies",
        "patterns": [
            r"\bhobbies\b", r"\binterests\b", r"\bextracurricular\b",
            r"\bactivities\b", r"\bclub\b", r"\bsports\b",
        ],
        "mapped_to": "gender/religion/culture",
        "confidence": 0.55,
    },
    {
        "variable": "name",
        "patterns": [
            r"\bfirst\s+name\b", r"\blast\s+name\b", r"\bsurname\b",
            r"\bfull\s+name\b",
        ],
        "mapped_to": "race/national_origin/gender",
        "confidence": 0.65,
    },
]


def detect_proxies(text: str) -> List[Dict[str, Any]]:
    """
    Detect proxy variables in the input text.
    Returns a list of findings dicts.
    """
    text_lower = text.lower()
    findings: List[Dict[str, Any]] = []
    seen: set = set()

    for rule in PROXY_RULES:
        if rule["variable"] in seen:
            continue
        for pattern in rule["patterns"]:
            if re.search(pattern, text_lower):
                findings.append({
                    "variable": rule["variable"],
                    "mapped_to": rule["mapped_to"],
                    "confidence": rule["confidence"],
                })
                seen.add(rule["variable"])
                break

    return findings
