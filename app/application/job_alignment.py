"""Compare each JD responsibility with concrete CV work and project evidence."""

from __future__ import annotations

import re

from app.application.nlp_text import tfidf_cosine, tokenize
from app.application.requirement_evidence import TASK_START
from app.application.skill_matching import match_tier, skill_mentions

ACTION_PATTERNS = {
    "research": r"nghien cuu|thu nghiem|research|experiment|explor|investigat",
    "build": r"xay dung|phat trien|lap trinh|thiet ke|build|built|develop|implement|creat|design",
    "train": r"huan luyen|fine tuning|finetun|train",
    "integrate": r"tich hop|ket noi|integrat|connect",
    "data": r"thu thap|tien xu ly|xu ly du lieu|preprocess|data processing|prepare data|parsing|chunking",
    "evaluate": r"danh gia|kiem thu|test|evaluat|benchmark",
    "deploy": r"trien khai|van hanh|deploy|operat",
    "document": r"viet tai lieu|bao cao|document|report",
    "collaborate": r"phoi hop|lam viec nhom|collaborat|teamwork",
}
CONTENT_STOPWORDS = {
    "and",
    "are",
    "build",
    "built",
    "cho",
    "cua",
    "cac",
    "develop",
    "duoc",
    "for",
    "from",
    "he",
    "ho",
    "lam",
    "nghien",
    "research",
    "the",
    "this",
    "thi",
    "toi",
    "trong",
    "with",
    "you",
    "your",
    "xay",
    "ve",
    "voi",
    "ung",
    "dung",
    "can",
    "co",
    "ky",
    "nang",
    "tham",
    "gia",
    "tro",
    "phat",
    "trien",
    "su",
    "viec",
    "cong",
}


def _actions(text: str) -> set[str]:
    normalized = " ".join(tokenize(text))
    return {name for name, pattern in ACTION_PATTERNS.items() if re.search(pattern, normalized)}


def _content_tokens(text: str) -> set[str]:
    return {
        token
        for token in tokenize(text)
        if (len(token) >= 3 or token == "ai") and token not in CONTENT_STOPWORDS
    }


def _task_lines(jd_profile: dict) -> list[str]:
    description = jd_profile.get("job_description") or {}
    lines = description.get("responsibilities") or []
    if not lines and description.get("description"):
        lines = re.split(r"(?<=[.!?;])\s+|\n+", description["description"])
    found = []
    seen = set()
    for line in lines:
        clean = re.sub(r"^[•\-–*]+\s*", "", str(line)).strip()
        key = tuple(tokenize(clean))
        if (
            not key
            or key in seen
            or not (
                TASK_START.search(clean)
                or re.match(r"^(?:you will|bạn sẽ)\b", clean, re.IGNORECASE)
            )
        ):
            continue
        seen.add(key)
        found.append(clean)
    return found


def _cv_sources(cv_profile: dict) -> list[dict[str, str]]:
    sources = []
    for section in ("experience", "projects"):
        for entry in cv_profile.get(section, []) or []:
            if not isinstance(entry, dict):
                continue
            title = str(entry.get("title") or "").strip()
            details = str(entry.get("details") or "").strip()
            fragments = [
                part.strip() for part in re.split(r"(?<=[.!?;])\s+|\n+", details) if part.strip()
            ]
            for fragment in fragments or ([title] if title else []):
                sources.append(
                    {
                        "section": "Experience" if section == "experience" else "Projects",
                        "text": f"{title}. {fragment}"
                        if section == "projects" and title and title != fragment
                        else fragment,
                        "evidence": f"{title} | {fragment}"
                        if title and title != fragment
                        else fragment,
                    }
                )
    return sources


def _candidate(task: str, source: dict[str, str], corpus: tuple[str, ...]) -> dict:
    jd_skills = skill_mentions(task)
    cv_skills = skill_mentions(source["text"])
    matched_skills = []
    strengths = []
    for jd_skill in jd_skills:
        matches = [
            (result[1], cv_skill["name"])
            for cv_skill in cv_skills
            if (result := match_tier(jd_skill["name"], cv_skill["name"]))
        ]
        if matches:
            strength, cv_name = max(matches)
            strengths.append(strength)
            matched_skills.append({"jd_skill": jd_skill["name"], "cv_skill": cv_name})
    coverage = sum(strengths) / len(jd_skills) if jd_skills else 0.0
    source_actions = (
        set()
        if re.match(
            r"^(?:learned|studied|familiar with|knowledge of|tìm hiểu|được học)\b",
            source["text"],
            re.IGNORECASE,
        )
        else _actions(source["text"])
    )
    shared_actions = sorted(_actions(task) & source_actions)
    cosine = tfidf_cosine(task, source["text"], corpus)
    if jd_skills:
        if coverage:
            score = 0.6 * coverage + 0.3 * bool(shared_actions) + 0.1 * cosine
        else:
            # Shared work can be relevant without proving a named JD technology.
            common_content = _content_tokens(task) & _content_tokens(source["text"])
            score = 0.30 + 0.10 * cosine if shared_actions and common_content else 0.0
    else:
        common_content = _content_tokens(task) & _content_tokens(source["text"])
        score = 0.55 + 0.35 * cosine if shared_actions and common_content else 0.0
    return {
        "score": round(min(score, 1.0) * 100, 1),
        "cv_section": source["section"],
        "cv_evidence": source["evidence"],
        "matched_skills": matched_skills,
        "shared_actions": shared_actions,
        "cosine_similarity": cosine,
    }


def compare_job_description(cv_profile: dict, jd_profile: dict) -> list[dict]:
    """Rank CV evidence for each JD task; unmatched tasks retain a zero score."""
    tasks = _task_lines(jd_profile)
    sources = _cv_sources(cv_profile)
    corpus = tuple(dict.fromkeys([*tasks, *(source["text"] for source in sources)]))
    results = []
    for task in tasks:
        candidates = [_candidate(task, source, corpus) for source in sources]
        best = max(candidates, key=lambda item: item["score"], default=None)
        if best is None or best["score"] < 30:
            results.append(
                {
                    "jd_text": task,
                    "status": "unverified",
                    "score": 0.0,
                    "cv_section": "",
                    "cv_evidence": "",
                    "matched_skills": [],
                    "shared_actions": [],
                    "cosine_similarity": 0.0,
                }
            )
        else:
            results.append(
                {"jd_text": task, "status": "strong" if best["score"] >= 80 else "partial", **best}
            )
    return results
