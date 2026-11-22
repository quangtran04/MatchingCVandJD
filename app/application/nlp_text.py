"""Offline tokenization, Vietnamese compound merging, and sparse TF-IDF cosine.

TF-IDF compares shared words, Vietnamese technical compound terms, and character
n-grams. It measures lexical similarity; it does not infer meaning from unrelated
words.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from functools import lru_cache

TOKEN_PATTERN = re.compile(r"c\+\+|c#|[a-z0-9]+(?:[+#][a-z0-9]+)*")

# Domain-oriented Vietnamese compound vocabulary (accent-stripped, longest-first).
# Used in TF-IDF feature extraction so multi-syllable Vietnamese terms such as
# "co so du lieu" or "kiem thu tu dong" act as cohesive units rather than noisy
# single syllables.
VIETNAMESE_COMPOUNDS: tuple[tuple[str, ...], ...] = tuple(
    sorted(
        {
            ("xu", "ly", "ngon", "ngu", "tu", "nhien"),
            ("cong", "nghe", "thong", "tin"),
            ("khoa", "hoc", "may", "tinh"),
            ("khoa", "hoc", "du", "lieu"),
            ("ky", "thuat", "phan", "mem"),
            ("tri", "tue", "nhan", "tao"),
            ("co", "so", "du", "lieu"),
            ("kiem", "thu", "tu", "dong"),
            ("kiem", "thu", "don", "vi"),
            ("thi", "giac", "may", "tinh"),
            ("thanh", "toan", "dien", "tu"),
            ("he", "thong", "thong", "tin"),
            ("lap", "trinh", "vien"),
            ("tu", "dong", "hoa"),
            ("xu", "ly", "su", "co"),
            ("xu", "ly", "du", "lieu"),
            ("tien", "xu", "ly"),
            ("toi", "uu", "hoa"),
            ("giao", "dien", "nguoi", "dung"),
            ("trai", "nghiem", "nguoi", "dung"),
            ("tinh", "san", "sang"),
            ("tinh", "on", "dinh"),
            ("thoi", "gian", "phan", "hoi"),
            ("muc", "tieu", "nghe", "nghiep"),
            ("kinh", "nghiem", "lam", "viec"),
            ("tai", "lieu", "ky", "thuat"),
            ("tai", "lieu", "chuyen", "nganh"),
            ("lam", "viec", "nhom"),
            ("giai", "quyet", "van", "de"),
            ("tu", "duy", "logic"),
            ("xu", "ly"),
            ("ngon", "ngu"),
            ("tu", "nhien"),
            ("hoc", "may"),
            ("hoc", "sau"),
            ("du", "lieu"),
            ("mo", "hinh"),
            ("huan", "luyen"),
            ("danh", "gia"),
            ("kiem", "thu"),
            ("trien", "khai"),
            ("van", "hanh"),
            ("bao", "tri"),
            ("bao", "mat"),
            ("hieu", "nang"),
            ("toi", "uu"),
            ("phat", "trien"),
            ("thiet", "ke"),
            ("tich", "hop"),
            ("ket", "noi"),
            ("giam", "sat"),
            ("canh", "bao"),
            ("su", "co"),
            ("ha", "tang"),
            ("may", "chu"),
            ("quan", "tri"),
            ("quan", "ly"),
            ("he", "thong"),
            ("dich", "vu"),
            ("ung", "dung"),
            ("phan", "mem"),
            ("giao", "dien"),
            ("nguoi", "dung"),
            ("dong", "goi"),
            ("truy", "van"),
            ("phan", "tich"),
            ("nghien", "cuu"),
            ("thu", "nghiem"),
            ("bao", "cao"),
            ("phoi", "hop"),
            ("dam", "bao"),
            ("chat", "luong"),
            ("san", "pham"),
            ("quy", "trinh"),
            ("du", "an"),
            ("ky", "nang"),
            ("kinh", "nghiem"),
            ("hoc", "van"),
            ("ngoai", "ngu"),
            ("chung", "chi"),
            ("chuyen", "nganh"),
            ("dai", "hoc"),
            ("cu", "nhan"),
            ("ky", "su"),
            ("thac", "si"),
            ("tien", "si"),
            ("sinh", "vien"),
            ("thuc", "tap"),
            ("chi", "phi"),
            ("tu", "dong"),
            ("doc", "hieu"),
        },
        key=len,
        reverse=True,
    )
)
_COMPOUND_SET: frozenset[tuple[str, ...]] = frozenset(VIETNAMESE_COMPOUNDS)
_MAX_COMPOUND_LEN: int = max(len(c) for c in VIETNAMESE_COMPOUNDS)


def tokenize(text: str) -> list[str]:
    """Normalize Unicode/accents and split into technical word tokens."""
    normalized = unicodedata.normalize("NFKC", text).casefold().replace("đ", "d")
    normalized = "".join(
        char
        for char in unicodedata.normalize("NFD", normalized)
        if unicodedata.category(char) != "Mn"
    )
    return TOKEN_PATTERN.findall(normalized)


def segment_vietnamese_compounds(tokens: list[str]) -> list[str]:
    """Merge domain Vietnamese multi-syllable terms using greedy longest-match."""
    merged: list[str] = []
    index = 0
    total = len(tokens)
    while index < total:
        matched_len = 0
        upper = min(_MAX_COMPOUND_LEN, total - index)
        for length in range(upper, 1, -1):
            candidate = tuple(tokens[index : index + length])
            if candidate in _COMPOUND_SET:
                merged.append("_".join(candidate))
                matched_len = length
                break
        if matched_len:
            index += matched_len
        else:
            merged.append(tokens[index])
            index += 1
    return merged


@lru_cache(maxsize=4096)
def _features(text: str, kind: str) -> Counter[str]:
    words = tokenize(text)
    if kind == "word":
        segmented = segment_vietnamese_compounds(words)
        # Keep merged Vietnamese compound terms alongside atomic tokens so both
        # exact compound phrases and partial overlaps contribute cleanly.
        counts = Counter(segmented)
        for token in words:
            if token not in counts:
                counts[token] += 1
        return counts
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
