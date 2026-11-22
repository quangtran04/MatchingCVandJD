"""Baseline CV-JD matching methods for empirical comparison.

Provides three standard baselines referenced in the evaluation rubric:
1. Pure keyword matching (exact case-insensitive skill presence in raw CV text).
2. Full-text TF-IDF cosine similarity (bag-of-words document vectors).
3. Multilingual Sentence-BERT cosine similarity (paraphrase-multilingual-MiniLM-L12-v2).
"""

from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

from app.application.nlp_text import tokenize
from app.application.skill_matching import requirements_from_lines


def _extract_jd_keyword_list(jd_profile: dict) -> list[str]:
    """Extract surface skill names from JD required and preferred requirements."""
    reqs = jd_profile.get("requirements") or {}
    lines = list(reqs.get("mandatory_skills") or []) + list(
        jd_profile.get("preferred_requirements") or []
    )
    parsed = requirements_from_lines(lines)
    keywords: list[str] = []
    seen: set[str] = set()
    for item in parsed:
        for opt in item.get("options", [item]):
            name = str(opt.get("name", "")).strip()
            key = name.casefold()
            if name and key not in seen:
                keywords.append(name)
                seen.add(key)
    return keywords


def score_keyword_baseline(cv_text: str, jd_profile: dict) -> float:
    """Pure case-insensitive exact keyword overlap percentage in [0, 100]."""
    keywords = _extract_jd_keyword_list(jd_profile)
    if not keywords:
        return 0.0
    hits = 0
    for kw in keywords:
        pattern = rf"(?<![A-Za-z0-9_]){re.escape(kw)}(?![A-Za-z0-9_])"
        if re.search(pattern, cv_text, re.IGNORECASE):
            hits += 1
    return round(100.0 * hits / len(keywords), 2)


def score_tfidf_fulltext_batch(jd_text: str, cv_texts: list[str]) -> list[float]:
    """Compute document-level full-text TF-IDF cosine similarity (0-100 scale)."""
    docs = [jd_text, *cv_texts]
    doc_tokens = [Counter(tokenize(doc)) for doc in docs]
    n_docs = len(docs)
    df: Counter[str] = Counter()
    for counts in doc_tokens:
        df.update(counts.keys())

    def to_vec(counts: Counter[str]) -> dict[str, float]:
        return {
            term: (1.0 + math.log(freq)) * (math.log((n_docs + 1.0) / (df[term] + 1.0)) + 1.0)
            for term, freq in counts.items()
        }

    jd_vec = to_vec(doc_tokens[0])
    jd_norm = math.sqrt(sum(v * v for v in jd_vec.values()))
    scores: list[float] = []
    for counts in doc_tokens[1:]:
        cv_vec = to_vec(counts)
        cv_norm = math.sqrt(sum(v * v for v in cv_vec.values()))
        if not jd_norm or not cv_norm:
            scores.append(0.0)
            continue
        dot = sum(v * cv_vec.get(term, 0.0) for term, v in jd_vec.items())
        scores.append(round(100.0 * dot / (jd_norm * cv_norm), 2))
    return scores


@lru_cache(maxsize=1)
def _load_sbert_model(model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def score_sbert_batch(
    jd_text: str,
    cv_texts: list[str],
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
) -> list[float]:
    """Compute multilingual Sentence-BERT cosine similarity (0-100 scale)."""
    import numpy as np

    model = _load_sbert_model(model_name)
    embeddings = model.encode([jd_text, *cv_texts], normalize_embeddings=True, show_progress_bar=False)
    jd_emb = embeddings[0]
    scores: list[float] = []
    for cv_emb in embeddings[1:]:
        sim = float(np.dot(jd_emb, cv_emb))
        scores.append(round(max(0.0, sim) * 100.0, 2))
    return scores
