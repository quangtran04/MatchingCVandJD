"""Explainable, heading-driven CV information extraction.

The extractor intentionally uses deterministic rules so it works offline and can
be inspected in an NLP course report. Heading aliases cover common Vietnamese
and English CVs; unknown sections are preserved in their neighbouring field.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from itertools import pairwise

from app.application.nlp_text import tokenize

SECTION_ALIASES = {
    "summary": {
        "summary",
        "profile",
        "professional summary",
        "about me",
        "objective",
        "resume",
        "resumen",
        "zusammenfassung",
        "tom tat",
        "gioi thieu",
        "gioi thieu ban than",
        "muc tieu nghe nghiep",
        "muc tieu",
    },
    "skills": {
        "skills",
        "technical skills",
        "core skills",
        "competencies",
        "competences",
        "habilidades",
        "fahigkeiten",
        "ky nang",
        "ky nang chuyen mon",
        "nang luc",
        "ky nang lam viec",
    },
    "experience": {
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "experiencia",
        "berufserfahrung",
        "kinh nghiem",
        "kinh nghiem lam viec",
        "qua trinh cong tac",
        "kinh nghiem viec lam",
        "qua trinh lam viec",
    },
    "education": {
        "education",
        "academic background",
        "qualifications",
        "formation",
        "educacion",
        "ausbildung",
        "hoc van",
        "trinh do hoc van",
        "dai hoc",
        "qua trinh dao tao",
        "dao tao",
        "trinh do chuyen mon",
        "bang cap",
        "qua trinh hoc tap",
    },
    "projects": {
        "projects",
        "project experience",
        "selected projects",
        "projets",
        "proyectos",
        "projekte",
        "du an",
        "kinh nghiem du an",
        "du an ca nhan",
        "cac du an",
    },
    "certificates": {
        "certifications",
        "certificates",
        "certification",
        "certificats",
        "certificaciones",
        "zertifikate",
        "chung chi",
        "giai thuong",
        "chung chi va giai thuong",
        "khen thuong",
    },
    "languages": {
        "languages",
        "language",
        "language skills",
        "langues",
        "idiomas",
        "sprachen",
        "ngoai ngu",
        "ngon ngu",
    },
}

GENERIC_SKILL_CATEGORIES = {
    "programming languages",
    "ngon ngu lap trinh",
    "languages",
    "ngon ngu",
    "databases",
    "database",
    "co so du lieu",
    "tools",
    "cong cu",
    "other",
    "khac",
    "ai",
    "thu vien ai",
    "ai libraries",
    "libraries",
    "thu vien",
    "frameworks",
    "kien thuc nen tang",
    "fundamentals",
    "core knowledge",
    "ky nang ca nhan",
    "ky nang mem",
    "soft skills",
    "technical skills",
    "ky nang chuyen mon",
}

EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}")
DATE_PATTERN = re.compile(
    r"(?:(?:\d{1,2}[/.\-]\d{4}|\d{4})\s*(?:–|-|to|đến)\s*"
    r"(?:present|current|nay|hiện tại|\d{1,2}[/.\-]\d{4}|\d{4})(?:\s*\([^)]*\))?"
    r"|^(?:\d{1,2}[/.\-])?\d{4}(?:\s*\([^)]*\))?$)",
    re.IGNORECASE,
)
ADDRESS_PATTERN = re.compile(r"(?:địa chỉ|dia chi|address)\s*[:\-]\s*(.+)", re.IGNORECASE)

ICON_NOISE_PATTERN = re.compile(r"(?:^|(?<=\s))[⋄◆◇❖♦✦✧∙‣➤▪▫○●]\S*\s*")

_VIETNAMESE_BASE_MAP = str.maketrans({"đ": "d", "Đ": "d"})


def extract_cv_profile(text: str) -> dict[str, object]:
    """Return the course-project schema from raw CV text."""
    normalized = _normalize_text(text)
    sections, preamble = _split_sections(normalized)
    return {
        "summary": _collapse(sections.get("summary", "")),
        "skills": _extract_skills(sections.get("skills", "")),
        "experience": _extract_entries(sections.get("experience", ""), "experience"),
        "education": _extract_entries(sections.get("education", ""), "education"),
        "projects": _extract_entries(sections.get("projects", ""), "project"),
        "certificates": _extract_bullets(sections.get("certificates", "")),
        "languages": _extract_bullets(sections.get("languages", "")),
        "personal_info": _extract_personal_info(preamble),
    }


def _normalize_key(value: str) -> str:
    value = value.translate(_VIETNAMESE_BASE_MAP)
    decomposed = unicodedata.normalize("NFD", value.lower())
    without_marks = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", without_marks).strip()


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"(?<=[A-Za-zÀ-ỹ])-\n(?=[a-zà-ỹ])", "", text)
    text = re.sub(r"(?<=[A-Za-zÀ-ỹ])-\n(?=[A-ZÀ-Ỹ])", "-", text)
    return "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()).strip()


def _section_for_heading(line: str) -> str | None:
    key = _normalize_key(line.strip(" :.-•"))
    if not key:
        return None
    compact = key.replace(" ", "")
    for field, aliases in SECTION_ALIASES.items():
        normalized_aliases = {_normalize_key(alias) for alias in aliases}
        if key in normalized_aliases or (
            len(compact) >= 4 and compact in {alias.replace(" ", "") for alias in normalized_aliases}
        ):
            return field
    return None


def _split_sections(text: str) -> tuple[dict[str, str], str]:
    sections: dict[str, list[str]] = {field: [] for field in SECTION_ALIASES}
    preamble: list[str] = []
    current: str | None = None
    for line in text.splitlines():
        heading = _section_for_heading(line)
        if heading:
            current = heading
            continue
        if current is None:
            preamble.append(line)
        else:
            sections[current].append(line)
    return {key: "\n".join(value).strip() for key, value in sections.items()}, "\n".join(preamble)


def _collapse(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _merge_skill_lines(section: str) -> list[str]:
    merged: list[str] = []
    raw_lines = [line.strip() for line in section.splitlines() if line.strip()]
    has_structure = any(
        line.startswith(("•", "-", "–")) or ":" in line for line in raw_lines
    )
    for raw_line in raw_lines:
        is_bullet = raw_line.startswith(("•", "-", "–"))
        clean = raw_line.lstrip("•-– ").strip()
        if not clean:
            continue
        if not is_bullet and ":" not in clean and _is_skill_heading(clean):
            continue
        if (
            merged
            and not is_bullet
            and ":" not in clean
            and (
                has_structure
                or clean.startswith("(")
                or clean[0].islower()
                or merged[-1].endswith((",", ";", "|", ":"))
            )
        ):
            merged[-1] = f"{merged[-1]} {clean}"
        else:
            merged.append(clean)
    return merged


def _is_generic_skill_category(label: str) -> bool:
    key = _normalize_key(label)
    compact = key.replace(" ", "")
    return key in GENERIC_SKILL_CATEGORIES or compact in {
        item.replace(" ", "") for item in GENERIC_SKILL_CATEGORIES
    }


def _extract_skills(section: str) -> list[str]:
    skills: list[str] = []
    for clean in _merge_skill_lines(section):
        if ":" in clean:
            prefix, clean = clean.split(":", 1)
            prefix = prefix.strip(" .•-–")
            clean = clean.strip()
            if prefix and not _is_generic_skill_category(prefix):
                for part in re.split(r"[,;|&]", prefix):
                    part = part.strip(" .•-–")
                    if part and len(part) > 1 and not _is_skill_heading(part):
                        skills.append(part)
        for item in re.split(r"[,;|]", clean):
            item = item.strip(" .•-–")
            if item.startswith("(") and skills:
                skills[-1] = f"{skills[-1]} {item}"
                continue
            if item and len(item) > 1 and not _is_skill_heading(item):
                skills.append(item)
    seen: set[tuple[str, ...]] = set()
    unique_skills = []
    for skill in skills:
        key = tuple(tokenize(skill))
        if key and key not in seen:
            unique_skills.append(skill)
            seen.add(key)
    return unique_skills


def _is_skill_heading(value: str) -> bool:
    key = _normalize_key(value)
    compact = key.replace(" ", "")
    headings = {"technical skills", "language", "tools", "other", "ky nang", "ky nang chuyen mon"}
    return key in headings or compact in {item.replace(" ", "") for item in headings}


def _extract_entries(section: str, kind: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in section.splitlines() if line.strip()]
    if not lines:
        return []
    starts = [index for index, line in enumerate(lines) if _looks_like_entry_start(line, kind)]
    if not starts:
        entries = [{"title": lines[0], "details": _collapse(" ".join(lines[1:]))}]
        return _unique_entries(entries)
    starts.append(len(lines))
    entries = []
    for start, end in pairwise(starts):
        block = lines[start:end]
        title = block[0].lstrip("•-– ")
        date = next((line for line in block[1:] if DATE_PATTERN.search(line)), "")
        details = [line.lstrip("•-– ") for line in block[1:] if line != date]
        entry = {"title": title, "details": _collapse(" ".join(details))}
        if date:
            entry["date"] = date
        entries.append(entry)
    return _unique_entries(entries)


def _looks_like_entry_start(line: str, kind: str) -> bool:
    clean = line.lstrip("• ").strip()
    if kind == "project":
        return (
            line.startswith("•")
            or " | " in clean
            or (" - " in clean and not clean.lower().startswith("technologies"))
        )
    if kind == "experience":
        return "—" in clean or " - " in clean or " @ " in clean
    return bool(
        re.search(
            r"university|college|school|academy|đại học|học viện|cao đẳng",
            clean,
            re.IGNORECASE,
        )
    )


def _extract_bullets(section: str) -> list[str]:
    values = [_collapse(line.lstrip("•-– ")) for line in section.splitlines() if line.strip()]
    return _unique(value for value in values if value)


def _extract_personal_info(preamble: str) -> dict[str, str]:
    lines = [ICON_NOISE_PATTERN.sub(" ", line).strip() for line in preamble.splitlines() if line]
    lines = [line for line in lines if line]
    joined = " ".join(lines)
    emails = EMAIL_PATTERN.findall(joined)
    phones = [
        match.group().strip()
        for match in PHONE_PATTERN.finditer(joined)
        if len(re.sub(r"\D", "", match.group())) >= 9
    ]
    info: dict[str, str] = {}
    if lines:
        info["name"] = lines[0].strip("• ")
    if len(lines) > 1 and not EMAIL_PATTERN.search(lines[1]):
        info["headline"] = lines[1].strip("• ")
    if emails:
        info["email"] = emails[0]
    if phones:
        info["phone"] = phones[0]

    address_match = ADDRESS_PATTERN.search(joined)
    if address_match:
        info["location"] = _collapse(address_match.group(1))
    else:
        location_match = re.search(
            r"(?:hà nội|ha noi|hồ chí minh|ho chi minh|đà nẵng|da nang|hải phòng|hai phong|cần thơ|can tho)"
            r"(?:\s+(?:city|thành phố))?(?:\s*,\s*(?:viet nam|vietnam))?",
            joined,
            re.IGNORECASE,
        )
        if location_match:
            info["location"] = location_match.group().strip()
    return info


def _unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result = []
    for value in values:
        key = _normalize_key(value)
        if key and key not in seen:
            seen.add(key)
            result.append(value)
    return result


def _unique_entries(entries: list[dict[str, str]]) -> list[dict[str, str]]:
    """Drop entries whose title+details normalize to the same content.

    Repeated text extracted from multi-column PDFs or copy-paste artefacts
    commonly produces exact or near-exact duplicate entries; this keeps the
    first occurrence only.
    """
    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for entry in entries:
        key = _normalize_key(f"{entry.get('title', '')} {entry.get('details', '')}")
        if key and key not in seen:
            seen.add(key)
            result.append(entry)
        elif not key:
            result.append(entry)
    return result
