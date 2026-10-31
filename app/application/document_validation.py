"""Kiểm tra văn bản upload có đúng là CV / JD hay không (rule-based, chạy offline).

Ý tưởng: chấm điểm "giống CV" và "giống JD" dựa trên tín hiệu cấu trúc
(heading, email/SĐT, khoảng thời gian) + từ khóa đặc trưng, rồi so sánh hai điểm.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.application.job_extraction import ACTION_VERB_PATTERN, _lines, _section_name
from app.application.profile_extraction import (
    DATE_PATTERN,
    EMAIL_PATTERN,
    PHONE_PATTERN,
    _normalize_key,
    _section_for_heading,
)

MIN_TEXT_LENGTH = 150      # ngắn hơn thường là PDF scan / file rỗng
MIN_SCORE = 4.0            # điểm tối thiểu để coi là hợp lệ
MIN_MARGIN = 1.0           # điểm loại đúng phải hơn loại kia ít nhất ngần này

# Từ khóa đã bỏ dấu + lowercase (khớp qua _normalize_key)
CV_KEYWORDS = (
    "curriculum vitae", "date of birth", "ngay sinh", "linkedin", "career objective",
    "muc tieu nghe nghiep", "references", "nguoi tham chieu", "gioi tinh",
)
JD_KEYWORDS = (
    "ung vien", "ung tuyen", "tuyen dung", "nop ho so", "gui cv", "gui ho so",
    "quyen loi", "muc luong", "salary", "we are looking", "we re looking", "hiring",
    "join our team", "candidate", "apply", "job description", "mo ta cong viec",
    "yeu cau cong viec", "dia diem lam viec", "thoi gian lam viec", "hinh thuc lam viec",
)


@dataclass(frozen=True)
class ValidationResult:
    expected: str                 # "cv" | "jd"
    detected: str                 # "cv" | "jd" | "unknown"
    is_valid: bool
    cv_score: float
    jd_score: float
    reasons: list[str] = field(default_factory=list)

    @property
    def message(self) -> str:
        return " ".join(self.reasons)


def _count_keywords(text: str, keywords: tuple[str, ...]) -> int:
    haystack = f" {_normalize_key(text)} "
    return sum(1 for kw in keywords if f" {kw} " in haystack)


def _score_cv(text: str) -> float:
    score = 0.0

    sections = {
        s
        for line in text.splitlines()
        if (stripped := line.strip()) and len(stripped) <= 60
        and (s := _section_for_heading(stripped))
    }
    score += min(len(sections), 4) * 1.5

    if EMAIL_PATTERN.search(text):
        score += 2.0
    if any(len(re.sub(r"\D", "", m.group())) >= 9 for m in PHONE_PATTERN.finditer(text)):
        score += 1.5

    date_lines = sum(1 for line in text.splitlines() if DATE_PATTERN.search(line.strip()))
    score += 2.0 if date_lines >= 2 else (1.0 if date_lines == 1 else 0.0)

    score += min(_count_keywords(text, CV_KEYWORDS), 2) * 0.75
    return score


def _score_jd(text: str) -> float:
    score = 0.0
    lines = _lines(text)

    sections = {s for line in lines if (s := _section_name(line))}
    score += min(len(sections), 4) * 1.5

    score += min(_count_keywords(text, JD_KEYWORDS), 5) * 0.75

    action_lines = sum(
        1 for line in lines
        if re.search(ACTION_VERB_PATTERN, line.lstrip("•-–—*+ "), re.IGNORECASE)
    )
    if action_lines >= 3:
        score += 1.5
    return score


def _validate(text: str, expected: str) -> ValidationResult:
    text = (text or "").strip()
    label = "CV" if expected == "cv" else "JD"

    if len(text) < MIN_TEXT_LENGTH:
        return ValidationResult(
            expected, "unknown", False, 0.0, 0.0,
            [f"Nội dung quá ngắn hoặc không đọc được chữ (file scan/ảnh?), không thể xác nhận là {label}."],
        )

    cv_score, jd_score = _score_cv(text), _score_jd(text)
    if cv_score >= MIN_SCORE and cv_score - jd_score >= MIN_MARGIN:
        detected = "cv"
    elif jd_score >= MIN_SCORE and jd_score - cv_score >= MIN_MARGIN:
        detected = "jd"
    else:
        detected = "unknown"

    reasons: list[str] = []
    if detected == expected:
        return ValidationResult(expected, detected, True, cv_score, jd_score, reasons)

    if detected == "unknown":
        reasons.append(f"Không nhận diện được đây là {label}: thiếu các mục đặc trưng.")
    else:
        other = "JD" if detected == "jd" else "CV"
        reasons.append(f"File này giống {other} hơn là {label}. Bạn có upload nhầm ô không?")
    return ValidationResult(expected, detected, False, cv_score, jd_score, reasons)


def validate_cv_text(text: str) -> ValidationResult:
    return _validate(text, "cv")


def validate_jd_text(text: str) -> ValidationResult:
    return _validate(text, "jd")


class InvalidDocumentError(ValueError):
    """Một hoặc nhiều văn bản không phải loại tài liệu mong đợi."""

    def __init__(self, results: list[ValidationResult]) -> None:
        self.results = results
        super().__init__(" ".join(f"[{r.expected.upper()}] {r.message}" for r in results))


def validate_pair(cv_text: str, jd_text: str) -> list[ValidationResult]:
    """Validate cả hai văn bản, trả về danh sách kết quả KHÔNG hợp lệ (rỗng = ổn)."""
    cv, jd = validate_cv_text(cv_text), validate_jd_text(jd_text)
    failed = [r for r in (cv, jd) if not r.is_valid]
    # Dán nhầm ô: CV nhận ra là JD và JD nhận ra là CV -> báo một thông điệp rõ ràng.
    if cv.detected == "jd" and jd.detected == "cv":
        swapped = "Có vẻ bạn đã dán nhầm ô: nội dung ở ô {} đang là {}."
        return [
            ValidationResult("cv", "jd", False, cv.cv_score, cv.jd_score, [swapped.format("CV", "JD")]),
            ValidationResult("jd", "cv", False, jd.cv_score, jd.jd_score, [swapped.format("JD", "CV")]),
        ]
    return failed


def ensure_cv(text: str) -> None:
    result = validate_cv_text(text)
    if not result.is_valid:
        raise InvalidDocumentError([result])


def ensure_jd(text: str) -> None:
    result = validate_jd_text(text)
    if not result.is_valid:
        raise InvalidDocumentError([result])


def ensure_pair(cv_text: str, jd_text: str) -> None:
    failed = validate_pair(cv_text, jd_text)
    if failed:
        raise InvalidDocumentError(failed)