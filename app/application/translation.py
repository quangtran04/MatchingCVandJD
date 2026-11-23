"""Lightweight, cached batch text translation for post-processing CV/JD results."""

from __future__ import annotations

import re
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Iterable

import requests

GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"
MAX_CACHE_ENTRIES = 6000
MAX_CHUNK_CHARS = 2200
SEGMENT_SEP = "\n[[[TL_SEG_9X]]]\n"
SEGMENT_SEP_RE = re.compile(r"\s*\[\[\[\s*TL_SEG_9X\s*\]\]\]\s*")

_CACHE: OrderedDict[tuple[str, str], str] = OrderedDict()
_CACHE_LOCK = Lock()

_VN_ACCENT_RE = re.compile(
    r"[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ"
    r"àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]"
)

_BUILTIN_TRANSLATIONS: dict[str, dict[str, str]] = {
    "vi": {
        "full-time": "Toàn thời gian",
        "part-time": "Bán thời gian",
        "contract": "Hợp đồng",
        "intern": "Thực tập sinh",
        "not specified": "Chưa xác định",
        "not required": "Không yêu cầu",
        "none": "Không có",
    },
    "en": {
        "không có": "None",
        "chưa xác định": "Not specified",
        "không yêu cầu": "Not required",
        "toàn thời gian": "Full-time",
        "bán thời gian": "Part-time",
        "hợp đồng": "Contract",
        "thực tập sinh": "Intern",
    },
}

# Patterns for strings that should not be sent to translation
_SKIP_PATTERNS = (
    re.compile(r"^[\d\s.,:/%+\-–—()]+$"),
    re.compile(r"^[\w.+-]+@[\w-]+\.[\w.-]+$"),
    re.compile(r"^https?://\S+$", re.IGNORECASE),
    re.compile(r"^[A-Z0-9#+./\-_]{1,12}$"),
)

_TECH_ONLY_RE = re.compile(
    r"^(?:[A-Za-z0-9#+._/\-]+(?:\s+[A-Za-z0-9#+._/\-]+){0,2})$"
)

_KNOWN_TECH_TERMS = {
    "python", "java", "javascript", "typescript", "c++", "c#", "go", "golang", "rust",
    "php", "ruby", "swift", "kotlin", "scala", "sql", "nosql", "html", "css", "html/css",
    "react", "reactjs", "next.js", "nextjs", "vue", "vuejs", "angular", "redux", "tailwind",
    "tailwind css", "webpack", "vite", "node.js", "nodejs", "express", "fastapi", "flask",
    "django", "spring", "spring boot", "postgresql", "mysql", "mongodb", "redis", "kafka",
    "docker", "kubernetes", "aws", "gcp", "azure", "terraform", "ansible", "prometheus",
    "grafana", "argocd", "helm", "linux", "git", "github", "gitlab", "ci/cd", "jenkins",
    "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "opencv", "langchain",
    "llamaindex", "crewai", "hugging face", "llm", "rag", "nlp", "computer vision",
    "machine learning", "deep learning", "selenium", "cypress", "playwright", "jmeter",
    "postman", "jira", "rest api", "restful api", "graphql", "microservices", "agile",
    "scrum", "antigravity", "pgvector", "qdrant", "chromadb", "n8n", "ui/ux", "iot",
}


_EN_CLAUSE_WORD_RE = re.compile(
    r"\b(?:the|and|with|for|from|using|across|through|into|that|this|are|were|was|have|has|"
    r"built|developed|designed|managed|operated|provisioned|maintained|wrote|created|implemented|"
    r"collaborated|integrated|optimized|improved|reduced|cutting|reaching|serving|tested|logged|"
    r"tracked|worked|administered|automated|executed|reported|performed|prepared|analyzed|"
    r"experience|proficient|relevant|degree|years|monthly|daily|average|response|release|"
    r"pipelines?|environments?|applications?|interfaces?|services?|queries|systems?)\b",
    re.IGNORECASE,
)


def _contains_english_clauses(text: str) -> bool:
    return len(_EN_CLAUSE_WORD_RE.findall(text)) >= 2


def _is_already_vietnamese(text: str) -> bool:
    if _contains_english_clauses(text):
        return False
    accents = _VN_ACCENT_RE.findall(text)
    if len(accents) >= 2:
        return True
    return len(accents) == 1 and len(text.split()) <= 4


def should_skip_translation(text: str, target_lang: str = "") -> bool:
    stripped = text.strip()
    if not stripped or len(stripped) <= 1:
        return True
    if stripped.lower() in _KNOWN_TECH_TERMS:
        return True
    for pat in _SKIP_PATTERNS:
        if pat.fullmatch(stripped):
            return True
    if target_lang == "vi" and _is_already_vietnamese(stripped):
        return True
    return False


def _cache_get(target_lang: str, text: str) -> str | None:
    key = (target_lang, text)
    with _CACHE_LOCK:
        val = _CACHE.get(key)
        if val is not None:
            _CACHE.move_to_end(key)
        return val


def _cache_set(target_lang: str, text: str, translated: str) -> None:
    key = (target_lang, text)
    with _CACHE_LOCK:
        _CACHE[key] = translated
        _CACHE.move_to_end(key)
        while len(_CACHE) > MAX_CACHE_ENTRIES:
            _CACHE.popitem(last=False)


def _google_translate_raw(
    text: str, target_lang: str, source_lang: str = "auto", timeout: float = 8.0
) -> str | None:
    try:
        resp = requests.get(
            GOOGLE_TRANSLATE_URL,
            params={
                "client": "gtx",
                "sl": source_lang,
                "tl": target_lang,
                "dt": "t",
                "q": text,
            },
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], list):
            return None
        parts = [seg[0] for seg in data[0] if isinstance(seg, list) and seg and seg[0]]
        return "".join(parts) if parts else None
    except Exception:
        return None


_DEGREE_PRE_REPLACEMENTS_VI: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bB\.?\s*Eng\.?(?=\s+in\b|\s*,|\s|$)", re.IGNORECASE), "Bachelor of Engineering"),
    (re.compile(r"\bB\.?\s*Sc\.?(?=\s+in\b|\s*,|\s|$)", re.IGNORECASE), "Bachelor of Science"),
    (re.compile(r"\bB\.?\s*S\.?(?=\s+in\b)", re.IGNORECASE), "Bachelor of Science"),
    (re.compile(r"\bB\.?\s*A\.?(?=\s+in\b)", re.IGNORECASE), "Bachelor of Arts"),
    (re.compile(r"\bM\.?\s*Eng\.?(?=\s+in\b|\s*,|\s|$)", re.IGNORECASE), "Master of Engineering"),
    (re.compile(r"\bM\.?\s*Sc\.?(?=\s+in\b|\s*,|\s|$)", re.IGNORECASE), "Master of Science"),
    (re.compile(r"\bPh\.?\s*D\.?(?=\s+in\b|\s*,|\s|$)", re.IGNORECASE), "Doctor of Philosophy"),
)

_REDUNDANT_DEGREE_PREFIX_VI = re.compile(
    r"\b(?:B\.?\s*Eng\.?|B\.?\s*Sc\.?|B\.?\s*S\.?|B\.?\s*A\.?|M\.?\s*Eng\.?|M\.?\s*Sc\.?|Ph\.?\s*D\.?)"
    r"\s+(?=(?:Kỹ\s+sư|Cử\s+nhân|Thạc\s+sĩ|Tiến\s+sĩ)\b)",
    re.IGNORECASE,
)


def _prepare_for_translation(text: str, target_lang: str) -> str:
    if target_lang != "vi":
        return text
    prepared = text
    for pattern, replacement in _DEGREE_PRE_REPLACEMENTS_VI:
        prepared = pattern.sub(replacement, prepared)
    return prepared


def _postprocess_translation(text: str, target_lang: str) -> str:
    if target_lang != "vi":
        return text
    return _REDUNDANT_DEGREE_PREFIX_VI.sub("", text).strip()


def _source_lang_for(text: str, target_lang: str) -> str:
    # Force explicit source language for mixed VI+EN strings so Google Translate
    # does not auto-detect sl == tl and return the mixed string untranslated.
    if target_lang == "vi":
        return "en"
    if target_lang == "en" and _VN_ACCENT_RE.search(text):
        return "vi"
    return "auto"


def _translate_chunk(chunk: list[str], target_lang: str) -> dict[str, str]:
    if not chunk:
        return {}
    if len(chunk) == 1:
        item = chunk[0]
        prepared = _prepare_for_translation(item, target_lang)
        sl = _source_lang_for(prepared, target_lang)
        translated = _google_translate_raw(prepared, target_lang, source_lang=sl) or item
        cleaned = _postprocess_translation(translated, target_lang) or item
        _cache_set(target_lang, item, cleaned)
        return {item: cleaned}

    prepared_chunk = [_prepare_for_translation(item, target_lang) for item in chunk]
    joined = SEGMENT_SEP.join(prepared_chunk)
    sl = _source_lang_for(joined, target_lang)
    translated_joined = _google_translate_raw(joined, target_lang, source_lang=sl)
    if translated_joined:
        pieces = SEGMENT_SEP_RE.split(translated_joined)
        if len(pieces) == len(chunk):
            result: dict[str, str] = {}
            for orig, trans in zip(chunk, pieces, strict=True):
                cleaned = _postprocess_translation(trans.strip(), target_lang) or orig
                _cache_set(target_lang, orig, cleaned)
                result[orig] = cleaned
            return result

    # Fallback: translate items individually if separator count mismatched
    result = {}
    for orig, prep in zip(chunk, prepared_chunk, strict=True):
        item_sl = _source_lang_for(prep, target_lang)
        translated = _google_translate_raw(prep, target_lang, source_lang=item_sl) or orig
        cleaned = _postprocess_translation(translated, target_lang) or orig
        _cache_set(target_lang, orig, cleaned)
        result[orig] = cleaned
    return result


def translate_texts(texts: Iterable[str], target_lang: str) -> dict[str, str]:
    """Translate a batch of strings to `target_lang` ('en' or 'vi'), with caching and batching."""
    lang = "en" if str(target_lang).lower().startswith("en") else "vi"
    unique_texts: list[str] = []
    seen: set[str] = set()
    for raw in texts:
        if not isinstance(raw, str):
            continue
        if raw in seen:
            continue
        seen.add(raw)
        unique_texts.append(raw)

    result: dict[str, str] = {}
    to_translate: list[str] = []
    builtin = _BUILTIN_TRANSLATIONS.get(lang, {})
    for item in unique_texts:
        lowered = item.strip().lower()
        if lowered in builtin:
            result[item] = builtin[lowered]
            continue
        if should_skip_translation(item, lang):
            result[item] = item
            continue
        cached = _cache_get(lang, item)
        if cached is not None:
            result[item] = cached
        else:
            to_translate.append(item)

    if not to_translate:
        return result

    # Pack into bounded chunks
    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    current_len = 0
    for item in to_translate:
        add_len = len(item) + len(SEGMENT_SEP)
        if current_chunk and current_len + add_len > MAX_CHUNK_CHARS:
            chunks.append(current_chunk)
            current_chunk = [item]
            current_len = len(item)
        else:
            current_chunk.append(item)
            current_len += add_len
    if current_chunk:
        chunks.append(current_chunk)

    if len(chunks) == 1:
        result.update(_translate_chunk(chunks[0], lang))
    else:
        with ThreadPoolExecutor(max_workers=min(4, len(chunks))) as pool:
            futures = [pool.submit(_translate_chunk, chunk, lang) for chunk in chunks]
            for fut in futures:
                result.update(fut.result())

    return result
