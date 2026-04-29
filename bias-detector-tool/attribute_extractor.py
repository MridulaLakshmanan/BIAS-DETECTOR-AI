"""
Attribute extractor — detects protected attributes using rule-based heuristics.
No external ML models required; uses regex + keyword matching.
"""

import re
from typing import List, Dict, Any

# ── Keyword lists ──────────────────────────────────────────────────────────────

GENDER_KEYWORDS = [
    "maternity", "paternity", "pregnant", "pregnancy", "breastfeeding",
    "motherhood", "fatherhood", "childcare", "caregiver", "homemaker",
    "housewife", "househusband", "she", "her", "hers", "he", "him", "his",
    "they", "them", "theirs", "woman", "man", "female", "male",
    "girl", "boy", "lady", "gentleman",
]

AGE_KEYWORDS = [
    "senior", "elderly", "retired", "retirement", "young", "entry-level",
    "entry level", "fresh graduate", "recent graduate", "junior", "intern",
    "millennial", "boomer", "gen z", "generation x", "age", "older",
    "younger", "seasoned", "experienced professional",
]

RACE_KEYWORDS = [
    "ethnic", "ethnicity", "minority", "diversity", "cultural background",
    "national origin", "immigrant", "foreign", "accent", "hbcu",
    "historically black", "tribal",
]

SOCIOECONOMIC_KEYWORDS = [
    "zip code", "neighborhood", "poverty", "welfare", "public housing",
    "affluent", "low-income", "low income", "working class", "blue collar",
    "white collar", "prestigious", "elite", "ivy league", "scholarship",
]

FAMILY_STATUS_KEYWORDS = [
    "gap year", "employment gap", "career gap", "sabbatical",
    "family leave", "maternity leave", "parental leave",
    "single parent", "divorced", "married", "single",
]

RELIGION_KEYWORDS = [
    "church", "mosque", "synagogue", "temple", "christian", "muslim",
    "jewish", "hindu", "buddhist", "atheist", "religious",
    "faith", "prayer", "sabbath", "halal", "kosher",
]

DISABILITY_KEYWORDS = [
    "disability", "disabled", "wheelchair", "blind", "deaf", "hearing impaired",
    "cognitive", "neurodivergent", "adhd", "autism", "autistic",
    "mental health", "anxiety", "depression", "chronic illness",
]

# Name patterns that may suggest national origin (simplified heuristic)
HISPANIC_SURNAME_ENDINGS = ["ez", "es", "az", "oz", "iz", "rez", "nez", "dez"]
ASIAN_NAME_INDICATORS = [
    "nguyen", "chen", "wang", "li ", "zhang", "kim", "park", "lee ",
    "singh", "kumar", "patel", "sharma", "rao", "khan",
]

# ── Detection functions ────────────────────────────────────────────────────────


def _find_keywords(text_lower: str, keywords: List[str]) -> List[str]:
    return [kw for kw in keywords if kw in text_lower]


def extract_attributes(text: str) -> List[Dict[str, Any]]:
    """
    Detect protected attributes in the input text.
    Returns a list of findings dicts.
    """
    text_lower = text.lower()
    findings: List[Dict[str, Any]] = []

    # ── Gender ──────────────────────────────────────────────
    gender_hits = _find_keywords(text_lower, GENDER_KEYWORDS)
    if gender_hits:
        findings.append({
            "attribute": "gender",
            "confidence": min(0.5 + len(gender_hits) * 0.1, 0.95),
            "matched_text": gender_hits[0],
            "detection_method": "rule_based_keywords",
        })

    # ── Age ─────────────────────────────────────────────────
    age_hits = _find_keywords(text_lower, AGE_KEYWORDS)
    # Look for DOB patterns: born in YYYY, DOB: YYYY, age XX
    dob_pattern = re.search(
        r"\b(born\s+in\s+\d{4}|dob[:\s]+\d{4}|age[:\s]+\d{1,3}|\d{4}\s*[-–]\d{4})\b",
        text_lower,
    )
    if age_hits or dob_pattern:
        matched = age_hits[0] if age_hits else dob_pattern.group(0)
        findings.append({
            "attribute": "age",
            "confidence": min(0.55 + len(age_hits) * 0.08, 0.95),
            "matched_text": matched,
            "detection_method": "rule_based_keywords",
        })

    # ── Race / National Origin ───────────────────────────────
    race_hits = _find_keywords(text_lower, RACE_KEYWORDS)
    # Name-origin heuristic (surname endings)
    name_origin_hit = None
    words = text_lower.split()
    for word in words:
        clean = re.sub(r"[^a-z]", "", word)
        if any(clean.endswith(e) and len(clean) > 4 for e in HISPANIC_SURNAME_ENDINGS):
            name_origin_hit = word
            break
        if any(indicator in text_lower for indicator in ASIAN_NAME_INDICATORS):
            name_origin_hit = "name_pattern"
            break

    if race_hits or name_origin_hit:
        method = "name_origin_classifier" if name_origin_hit else "rule_based_keywords"
        matched = name_origin_hit or race_hits[0]
        findings.append({
            "attribute": "race",
            "confidence": min(0.5 + len(race_hits) * 0.1 + (0.2 if name_origin_hit else 0), 0.95),
            "matched_text": matched,
            "detection_method": method,
        })

    # ── Socioeconomic ────────────────────────────────────────
    socio_hits = _find_keywords(text_lower, SOCIOECONOMIC_KEYWORDS)
    if socio_hits:
        findings.append({
            "attribute": "socioeconomic",
            "confidence": min(0.5 + len(socio_hits) * 0.12, 0.95),
            "matched_text": socio_hits[0],
            "detection_method": "rule_based_keywords",
        })

    # ── Family Status ────────────────────────────────────────
    family_hits = _find_keywords(text_lower, FAMILY_STATUS_KEYWORDS)
    if family_hits:
        findings.append({
            "attribute": "family_status",
            "confidence": min(0.55 + len(family_hits) * 0.1, 0.95),
            "matched_text": family_hits[0],
            "detection_method": "rule_based_keywords",
        })

    # ── Religion ─────────────────────────────────────────────
    religion_hits = _find_keywords(text_lower, RELIGION_KEYWORDS)
    if religion_hits:
        findings.append({
            "attribute": "religion",
            "confidence": min(0.5 + len(religion_hits) * 0.1, 0.95),
            "matched_text": religion_hits[0],
            "detection_method": "rule_based_keywords",
        })

    # ── Disability ───────────────────────────────────────────
    disability_hits = _find_keywords(text_lower, DISABILITY_KEYWORDS)
    if disability_hits:
        findings.append({
            "attribute": "disability",
            "confidence": min(0.5 + len(disability_hits) * 0.1, 0.95),
            "matched_text": disability_hits[0],
            "detection_method": "rule_based_keywords",
        })

    return findings
