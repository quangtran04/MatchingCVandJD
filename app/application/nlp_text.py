"""Offline tokenization and sparse TF-IDF cosine for short skill phrases.

TF-IDF compares shared words and character n-grams. It measures lexical
similarity; it does not infer meaning from unrelated words.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from functools import lru_cache

TOKEN_PATTERN = re.compile(r"c\+\+|c#|[a-z0-9]+(?:[+#][a-z0-9]+)*")


def tokenize(text: str) -> list[str]:
    """Normalize Unicode/accents and split into technical word tokens."""
    normalized = unicodedata.normalize("NFKC", text).casefold().replace("đ", "d")
    normalized = "".join(
        char
        for char in unicodedata.normalize("NFD", normalized)
        if unicodedata.category(char) != "Mn"
    )
    return TOKEN_PATTERN.findall(normalized)


@lru_cache(maxsize=4096)
def _features(text: str, kind: str) -> Counter[str]:
    words = tokenize(text)
    if kind == "word":
        return Counter(words)
    chars: Counter[str] = Counter()
    for word in words:
        padded = f"^{word}$"
        for length in (3, 4):
            chars.update(
                padded[index : index + length] for index in range(len(padded) - length + 1)
            )
    return chars


@lru_cache(maxsize=8)
def _document_frequencies(corpus: tuple[str, ...], kind: str) -> Counter[str]:
    frequencies: Counter[str] = Counter()
    for document in corpus:
        frequencies.update(_features(document, kind).keys())
    return frequencies


def _cosine(left: str, right: str, corpus: tuple[str, ...], kind: str) -> float:
    left_features = _features(left, kind)
    right_features = _features(right, kind)
    if not left_features or not right_features:
        return 0.0
    frequencies = _document_frequencies(corpus, kind)
    count = len(corpus)

    def weight(feature: str, frequency: int) -> float:
        idf = math.log((count + 1) / (frequencies[feature] + 1)) + 1
        return (1 + math.log(frequency)) * idf

    left_weights = {
        feature: weight(feature, frequency) for feature, frequency in left_features.items()
    }
    right_weights = {
        feature: weight(feature, frequency) for feature, frequency in right_features.items()
    }
    dot = sum(value * right_weights.get(feature, 0.0) for feature, value in left_weights.items())
    left_norm = math.sqrt(sum(value * value for value in left_weights.values()))
    right_norm = math.sqrt(sum(value * value for value in right_weights.values()))
    return dot / (left_norm * right_norm)


@lru_cache(maxsize=8192)
def tfidf_cosine(left: str, right: str, corpus: tuple[str, ...]) -> float:
    """Return the strongest word/character TF-IDF cosine in [0, 1]."""
    return round(max(_cosine(left, right, corpus, "word"), _cosine(left, right, corpus, "char")), 3)
