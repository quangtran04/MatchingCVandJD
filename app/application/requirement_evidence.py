"""Recognize JD task wording and compare nontechnical requirements with CV evidence.

Soft requirements stay outside the numerical score: CV text can show relevant
work, but it cannot prove a person's motivation or character.
"""

from __future__ import annotations

import re

from app.application.nlp_text import tokenize
from app.application.skill_matching import match_tier, skill_mentions

EXTRA_RULES = (
    (
        "ai_coding_tools",
        r"(?:ai.*(?:ho tro|support).*(?:lap trinh|coding|code)|(?:copilot|cursor|codeium|tabnine))",
    ),
    ("competition", r"cuoc thi|kaggle|hackathon|competition|contest"),
    ("project", r"du an|project"),
    (
        "work_style",
        r"tu duy logic|chu dong|hoc hoi|ham hoc|trach nhiem|giao tiep|lam viec nhom|logical thinking|problem.solving|self.learning|responsib|initiative|communication|teamwork",
    ),
    (
        "motivation",
        r"yeu thich|dam me|mong muon phat trien|passion|career goal|career growth|interest in",
    ),
)
CODING_TOOLS = re.compile(r"\b(?:github\s+copilot|copilot|cursor|codeium|tabnine)\b", re.IGNORECASE)
CHATGPT_CODING = re.compile(
    r"(?:chatgpt|claude).{0,55}(?:code|coding|programming|lập trình|viết mã)"
    r"|(?:code|coding|programming|lập trình|viết mã).{0,55}(?:chatgpt|claude)",
    re.IGNORECASE,
)
INTEREST_CLUE = re.compile(r"yêu thích|đam mê|quan tâm|passionate|interested", re.IGNORECASE)
CAREER_CLUE = re.compile(r"mong muốn|định hướng|career|seeking|aspiring", re.IGNORECASE)
WORK_STYLE_CLUES = {
    "logic": re.compile(r"logic|logical|problem.solving|giải quyết vấn đề", re.IGNORECASE),
    "learning": re.compile(
        r"chủ động học|tự học|ham học|eager to learn|self.learning|quick learner", re.IGNORECASE
    ),
    "responsibility": re.compile(r"trách nhiệm|responsib|accountab", re.IGNORECASE),
    "teamwork": re.compile(
        r"làm việc nhóm|phối hợp|teamwork|collaborat|communication|giao tiếp", re.IGNORECASE
    ),
}
TASK_START = re.compile(
    r"^(?:[•\-–]\s*)?(?:(?:công việc hằng ngày|nhiệm vụ|trách nhiệm|công việc chính)\s*[:\-]\s*)?"
    r"(?:hỗ trợ|tham gia|xây dựng|phát triển|thiết kế|tích hợp|"
    r"nghiên cứu|triển khai|huấn luyện|đánh giá|phân tích|xử lý|viết|quản lý|"
    r"tối ưu|lập trình|thu thập|phối hợp|build|develop|design|implement|"
    r"integrate|research|deploy|train|evaluate|analyze|write|manage|optimize|"
    r"collaborate|support)\b",
    re.IGNORECASE,
)


def _normalized(value: str) -> str:
    return " ".join(tokenize(value))


def extra_kind(line: str) -> str | None:
    value = _normalized(line)
    return next((name for name, pattern in EXTRA_RULES if re.search(pattern, value)), None)


def _entry_text(entry: object) -> str:
    if not isinstance(entry, dict):
        return ""
    return " | ".join(
        str(entry.get(key, "")).strip() for key in ("title", "date", "details") if entry.get(key)
    )


def _cv_sources(cv_profile: dict) -> list[dict[str, str]]:
    sources = []
    summary = cv_profile.get("summary")
    if isinstance(summary, str) and summary.strip():
        sources.append({"section": "Summary", "text": summary.strip()})
    for section in ("experience", "projects"):
        for entry in cv_profile.get(section, []) or []:
            value = _entry_text(entry)
            if value:
                sources.append({"section": section.title(), "text": value})
    for section in ("skills", "certificates"):
        for value in cv_profile.get(section, []) or []:
            if isinstance(value, str) and value.strip():
                sources.append({"section": section.title(), "text": value.strip()})
    return sources


def _work_style_clue(line: str) -> re.Pattern[str] | None:
    key = _normalized(line)
    if "logic" in key or "problem" in key:
        return WORK_STYLE_CLUES["logic"]
    if "hoc" in key or "learn" in key or "chu dong" in key:
        return WORK_STYLE_CLUES["learning"]
    if "trach nhiem" in key or "responsib" in key:
        return WORK_STYLE_CLUES["responsibility"]
    if "giao tiep" in key or "lam viec nhom" in key or "teamwork" in key or "communication" in key:
        return WORK_STYLE_CLUES["teamwork"]
    return None


def _split_work_style(line: str) -> list[str]:
    parts = [
        part.strip(" .;:") for part in re.split(r",|\s+và\s+|\s+and\s+", line, flags=re.IGNORECASE)
    ]
    return parts if len(parts) > 1 and all(_work_style_clue(part) for part in parts) else [line]


def _split_motivation(line: str) -> list[str]:
    parts = [
        part.strip(" .;:")
        for part in re.split(
            r"\s+(?:và|and)\s+(?=mong muốn|seeking|aspiring)", line, flags=re.IGNORECASE
        )
    ]
    return parts if len(parts) > 1 else [line]


def _find_extra_evidence(
    kind: str, jd_text: str, sources: list[dict[str, str]]
) -> dict[str, str] | None:
    for source in sources:
        value = source["text"]
        if kind == "ai_coding_tools" and (
            CODING_TOOLS.search(value) or CHATGPT_CODING.search(value)
        ):
            return source
        if kind == "motivation" and source["section"] == "Summary":
            clue = CAREER_CLUE if CAREER_CLUE.search(jd_text) else INTEREST_CLUE
            domain_ok = not re.search(
                r"\bAI\b|trí tuệ nhân tạo", jd_text, re.IGNORECASE
            ) or re.search(r"\bAI\b|trí tuệ nhân tạo|technology|công nghệ", value, re.IGNORECASE)
            if clue.search(value) and domain_ok:
                return source
        if kind == "work_style":
            clue = _work_style_clue(jd_text)
            if clue and clue.search(value):
                return source
        if kind == "competition" and re.search(
            r"kaggle|hackathon|cuộc thi|competition|contest", value, re.IGNORECASE
        ):
            return source
        if kind == "project" and source["section"] == "Projects":
            jd_technologies = skill_mentions(jd_text)
            if not jd_technologies or any(
                match_tier(jd_skill["name"], cv_skill["name"])
                for jd_skill in jd_technologies
                for cv_skill in skill_mentions(value)
            ):
                return source
    return None


def compare_other_requirements(cv_profile: dict, jd_profile: dict) -> list[dict[str, str]]:
    """Return explicit CV evidence, or an unverified status without a penalty."""
    requirements = jd_profile.get("requirements") or {}
    candidates = [
        {"text": line, "priority": "required"}
        for line in requirements.get("other_requirements", []) or []
    ]
    candidates.extend(
        {"text": line, "priority": "required"}
        for line in requirements.get("mandatory_skills", []) or []
        if extra_kind(line)
    )
    candidates.extend(
        {"text": line, "priority": "preferred"}
        for line in jd_profile.get("preferred_requirements", []) or []
        if extra_kind(line) or not skill_mentions(line)
    )
    sources = _cv_sources(cv_profile)
    seen = set()
    results = []
    for candidate in candidates:
        line = candidate["text"]
        kind = extra_kind(line) or "other"
        parts = (
            _split_work_style(line)
            if kind == "work_style"
            else _split_motivation(line)
            if kind == "motivation"
            else [line]
        )
        for part in parts:
            key = _normalized(part)
            if not key or key in seen:
                continue
            seen.add(key)
            priority = (
                "preferred"
                if re.search(r"điểm cộng|ưu tiên|nice to have", part, re.IGNORECASE)
                else candidate["priority"]
            )
            evidence = _find_extra_evidence(kind, part, sources)
            results.append(
                {
                    "jd_text": part,
                    "priority": priority,
                    "category": kind,
                    "status": "evidence" if evidence else "unverified",
                    "cv_section": evidence["section"] if evidence else "",
                    "cv_evidence": evidence["text"] if evidence else "",
                }
            )
    return results
