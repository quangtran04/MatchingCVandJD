"""Deterministic skill recognition and three-tier matching."""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from importlib.resources import files

from rapidfuzz.fuzz import ratio

from app.application.nlp_text import tfidf_cosine, tokenize

COSINE_THRESHOLD = 0.82


def _key(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold().replace("đ", "d")
    value = "".join(
        char for char in unicodedata.normalize("NFD", value) if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"\s+", " ", value).strip(" \t\r\n.,;:")


@lru_cache(maxsize=1)
def taxonomy() -> dict:
    return json.loads(files("app.data").joinpath("skill_taxonomy.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _aliases() -> tuple[tuple[str, str], ...]:
    pairs = [
        (alias, canonical)
        for canonical, aliases in taxonomy()["skills"].items()
        for alias in aliases
    ]
    return tuple(sorted(pairs, key=lambda pair: len(pair[0]), reverse=True))


@lru_cache(maxsize=1)
def _canonical_by_alias() -> dict[str, str]:
    return {_key(alias): canonical for alias, canonical in _aliases()}


@lru_cache(maxsize=1)
def _tfidf_corpus() -> tuple[str, ...]:
    return tuple(dict.fromkeys([*taxonomy()["skills"], *(alias for alias, _ in _aliases())]))


def canonical_skill(value: str) -> str:
    return _canonical_by_alias().get(_key(value), value.strip())


def _standalone_skill(line: str) -> bool:
    """Reject list numbering and punctuation while keeping short unknown skills."""
    return bool(re.search(r"[^\W\d_]", line, re.UNICODE)) and not re.fullmatch(
        r"\s*(?:\d+[.)]?|[IVXLCDM]+[.)]?)\s*", line, re.IGNORECASE
    )


def skill_mentions(line: str) -> list[dict[str, str]]:
    """Find named skills in a sentence, preferring the longest overlapping alias."""
    spans: list[tuple[int, int]] = []
    found: list[tuple[int, dict[str, str]]] = []
    for alias, canonical in _aliases():
        pattern = rf"(?<![\w]){re.escape(alias)}(?![\w])"
        for match in re.finditer(pattern, line, re.IGNORECASE):
            if any(match.start() < end and start < match.end() for start, end in spans):
                continue
            spans.append(match.span())
            found.append(
                (
                    match.start(),
                    {
                        "name": match.group(),
                        "canonical": canonical,
                        "evidence": line,
                    },
                )
            )
    return [entry for _, entry in sorted(found, key=lambda item: item[0])]


def skills_from_lines(lines: list[str], *, standalone: bool = False) -> list[dict[str, str]]:
    """Read JD requirement sentences or CV skill items without inventing skills."""
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in lines:
        mentions = skill_mentions(line)
        if (
            not mentions
            and standalone
            and _standalone_skill(line)
            and len(line) <= 40
            and len(tokenize(line)) <= 4
        ):
            mentions = [
                {"name": line.strip(), "canonical": canonical_skill(line), "evidence": line}
            ]
        for mention in mentions:
            key = _key(mention["canonical"])
            if key and key not in seen:
                found.append(mention)
                seen.add(key)
    return found


def requirements_from_lines(lines: list[str]) -> list[dict]:
    """Treat adjacent skills joined by 'or/hoặc' as one alternative requirement."""
    requirements: list[dict] = []
    seen: set[tuple[str, ...]] = set()
    for line in lines:
        mentions = skill_mentions(line)
        if (
            not mentions
            and _standalone_skill(line)
            and len(line) <= 40
            and len(tokenize(line)) <= 4
        ):
            mentions = [
                {"name": line.strip(), "canonical": canonical_skill(line), "evidence": line}
            ]
        index = 0
        while index < len(mentions):
            group = [mentions[index]]
            while index + 1 < len(mentions):
                left, right = mentions[index], mentions[index + 1]
                joined = re.escape(left["name"]) + r"\s+(?:or|hoặc)\s+" + re.escape(right["name"])
                if not re.search(joined, line, re.IGNORECASE):
                    break
                group.append(right)
                index += 1
            key = tuple(sorted(item["canonical"] for item in group))
            if key not in seen:
                requirements.append(
                    {
                        "name": " hoặc ".join(item["name"] for item in group),
                        "canonical": " | ".join(key),
                        "options": group,
                        "evidence": line,
                    }
                )
                seen.add(key)
            index += 1
    return requirements


def match_tier(jd_skill: str, cv_skill: str) -> tuple[str, float] | None:
    """Return tier and confidence; semantic fulfilment is directional from JD to CV."""
    jd_key, cv_key = _key(jd_skill), _key(cv_skill)
    if jd_key == cv_key:
        return "exact", 1.0
    jd_canonical, cv_canonical = canonical_skill(jd_skill), canonical_skill(cv_skill)
    if _key(jd_canonical) == _key(cv_canonical):
        return "normalized", 0.95
    cosine = tfidf_cosine(jd_skill, cv_skill, _tfidf_corpus())
    if cosine >= COSINE_THRESHOLD:
        return "normalized", round(0.9 * cosine, 3)
    if min(len(jd_key), len(cv_key)) >= 5:
        similarity = ratio(jd_key, cv_key)
        if similarity >= 92:
            return "normalized", round(similarity / 100 * 0.9, 3)
    if cv_canonical in taxonomy()["semantic_fulfills"].get(jd_canonical, []):
        return "semantic", 0.8
    return None


def assign_skills(
    required: list[dict[str, str]],
    preferred: list[dict[str, str]],
    cv_skills: list[dict[str, str]],
) -> tuple[list[dict], list[str]]:
    """Assign each CV skill once, prioritising required and closest matches."""
    requirements = [("required", entry) for entry in required]
    requirements.extend(("preferred", entry) for entry in preferred)
    edges = []
    for jd_index, (priority, jd) in enumerate(requirements):
        for cv_index, cv in enumerate(cv_skills):
            for option_index, option in enumerate(jd.get("options", [jd])):
                match = match_tier(option["name"], cv["name"])
                if match:
                    tier, confidence = match
                    edges.append(
                        (
                            0 if priority == "required" else 1,
                            {"exact": 0, "normalized": 1, "semantic": 2}[tier],
                            -confidence,
                            jd_index,
                            cv_index,
                            option_index,
                            option,
                            tier,
                            confidence,
                        )
                    )
    edges.sort()
    assigned_jd: set[int] = set()
    assigned_cv: set[int] = set()
    matches = []
    for _, _, _, jd_index, cv_index, _, option, tier, confidence in edges:
        if jd_index in assigned_jd or cv_index in assigned_cv:
            continue
        assigned_jd.add(jd_index)
        assigned_cv.add(cv_index)
        priority, jd = requirements[jd_index]
        cv = cv_skills[cv_index]
        cosine = tfidf_cosine(option["name"], cv["name"], _tfidf_corpus())
        if tier == "exact":
            method = "exact"
        elif tier == "semantic":
            method = "taxonomy_semantic"
        elif _key(canonical_skill(option["name"])) == _key(canonical_skill(cv["name"])):
            method = "taxonomy_alias"
        elif cosine >= COSINE_THRESHOLD:
            method = "tfidf_cosine"
        else:
            method = "rapidfuzz"
        matches.append(
            {
                "jd_skill": jd["name"],
                "jd_option": option["name"],
                "cv_skill": cv["name"],
                "canonical_jd": option["canonical"],
                "canonical_cv": cv["canonical"],
                "priority": priority,
                "tier": tier,
                "match_method": method,
                "confidence": confidence,
                "cosine_similarity": cosine,
                "jd_evidence": jd["evidence"],
                "cv_evidence": cv["evidence"],
            }
        )
    matches.sort(key=lambda match: (match["priority"] != "required", match["jd_skill"]))
    missing = [
        entry["name"]
        for index, (priority, entry) in enumerate(requirements)
        if priority == "required" and index not in assigned_jd
    ]
    return matches, missing
