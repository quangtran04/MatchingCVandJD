"""Explainable CV-to-JD scoring for the course MVP."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime

from app.application.job_alignment import compare_job_description
from app.application.requirement_evidence import (
    compare_other_requirements,
    extra_kind,
)
from app.application.skill_matching import (
    assign_skills,
    match_tier,
    requirements_from_lines,
    skill_mentions,
    skills_from_lines,
    taxonomy,
)

WEIGHTS = {
    "job_fit": 0.40,
    "skill_match": 0.35,
    "experience_match": 0.15,
    "education_match": 0.10,
    "project_relevance": 0.0,
}
PROJECT_BONUS_MAX = 10.0
YEAR_PATTERN = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*\+?\s*(?:years?|yrs?|năm)\b", re.IGNORECASE)
DATE_RANGE = re.compile(
    r"(?<!\d)(\d{1,2}/\d{4}|\d{4})\s*(?:–|—|-|to|đến)\s*"
    r"(\d{1,2}/\d{4}|\d{4}|present|current|now|nay|hiện tại)\b",
    re.IGNORECASE,
)
DEGREES = {
    "student": ("sinh viên", "student", "đang học", "undergraduate"),
    "bachelor": ("cử nhân", "bachelor", "đại học", "university degree", "kỹ sư"),
    "master": ("thạc sĩ", "master", "msc"),
    "phd": ("tiến sĩ", "phd", "doctorate"),
}
DEGREE_RANK = {"student": 0, "bachelor": 1, "master": 2, "phd": 3}
FIELDS = {
    "Information Technology": ("information technology", "công nghệ thông tin", "cntt"),
    "Computer Science": ("computer science", "khoa học máy tính"),
    "Artificial Intelligence": ("artificial intelligence", "trí tuệ nhân tạo"),
    "Data Science": ("data science", "khoa học dữ liệu"),
    "Software Engineering": ("software engineering", "kỹ thuật phần mềm"),
    "Mathematics and Computing": ("toán-tin", "toán tin"),
}


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _as_dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _strings(value: object) -> list[str]:
    return [item for item in _as_list(value) if isinstance(item, str) and item.strip()]


def _entry_text(entry: object) -> str:
    if not isinstance(entry, dict):
        return ""
    return " | ".join(
        str(entry.get(key, "")).strip() for key in ("title", "date", "details") if entry.get(key)
    )


def _years_from_text(lines: list[str]) -> tuple[float | None, str]:
    found = [
        (float(match.group(1).replace(",", ".")), line)
        for line in lines
        for match in YEAR_PATTERN.finditer(line)
    ]
    if not found:
        return None, ""
    return max(found, key=lambda item: item[0])


def _month(value: str, as_of: date, *, end_of_year: bool = False) -> int | None:
    if value.lower() in {"present", "current", "now", "nay", "hiện tại"}:
        return as_of.year * 12 + as_of.month
    if "/" in value:
        month, year = (int(piece) for piece in value.split("/"))
        if not 1 <= month <= 12:
            return None
        return year * 12 + month
    return int(value) * 12 + (12 if end_of_year else 1)


def _cv_years(entries: list, as_of: date) -> tuple[float | None, list[str]]:
    intervals: set[int] = set()
    evidence = []
    for entry in entries:
        text = _entry_text(entry)
        for match in DATE_RANGE.finditer(text):
            start = _month(match.group(1), as_of)
            end = _month(match.group(2), as_of, end_of_year=True)
            if start is None or end is None or end < start or start > as_of.year * 12 + as_of.month:
                continue
            intervals.update(range(start, min(end, as_of.year * 12 + as_of.month) + 1))
            evidence.append(text)
    explicit, explicit_evidence = _years_from_text([_entry_text(entry) for entry in entries])
    dated = len(intervals) / 12 if intervals else None
    if explicit is not None and (dated is None or explicit > dated):
        return explicit, [explicit_evidence]
    return dated, evidence


def _contains_phrase(text: str, phrase: str) -> bool:
    return bool(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text, re.IGNORECASE))


def _degree(text: str, *, cv: bool = False) -> str | None:
    if any(_contains_phrase(text, alias) for alias in DEGREES["student"]):
        return "student"
    for degree in ("phd", "master", "bachelor"):
        for alias in DEGREES[degree]:
            if not _contains_phrase(text, alias):
                continue
            if cv and degree == "bachelor" and alias == "đại học":
                # A university name alone is not proof that the degree is complete.
                continue
            return degree
    return None


def _fields(text: str) -> list[str]:
    found = []
    for canonical, aliases in FIELDS.items():
        if any(_contains_phrase(text, alias) for alias in aliases) or (
            canonical == "Information Technology" and re.search(r"\bIT\b", text)
        ):
            found.append(canonical)
    return found


def _metric(value: float | None, base_weight: float, reason: str, evidence: object) -> dict:
    return {
        "score": round(value, 1) if value is not None else None,
        "base_weight": base_weight,
        "effective_weight": 0.0,
        "weighted_points": 0.0,
        "reason": reason,
        "evidence": evidence,
    }


def match_profiles(cv_profile: dict, jd_profile: dict, *, as_of: date | None = None) -> dict:
    """Match extracted profiles; all scores are on a 0–100 scale or N/A."""
    as_of = as_of or datetime.now(UTC).astimezone().date()
    requirements = _as_dict(jd_profile.get("requirements"))
    responsibility_matches = compare_job_description(cv_profile, jd_profile)
    job_fit_score = (
        sum(item["score"] for item in responsibility_matches) / len(responsibility_matches)
        if responsibility_matches
        else None
    )
    job_fit_reason = (
        f"{len(responsibility_matches)} nhiệm vụ JD có trọng số ngang nhau; "
        "đối chiếu kỹ năng, hành động và TF-IDF cosine với Experience/Projects của CV."
        if responsibility_matches
        else "JD không có nhiệm vụ công việc đủ rõ để đối chiếu; tiêu chí N/A."
    )
    required = requirements_from_lines(
        [line for line in _strings(requirements.get("mandatory_skills")) if not extra_kind(line)]
    )
    preferred = requirements_from_lines(
        [
            line
            for line in _strings(jd_profile.get("preferred_requirements"))
            if not extra_kind(line)
        ]
    )
    required_keys = {option["canonical"] for skill in required for option in skill["options"]}
    preferred = [
        skill
        for skill in preferred
        if not all(option["canonical"] in required_keys for option in skill["options"])
    ]
    cv_skills = skills_from_lines(_strings(cv_profile.get("skills")), standalone=True)
    seen_cv_skills = {item["canonical"].casefold() for item in cv_skills}
    evidence_lines = [
        _entry_text(entry)
        for section in ("experience", "projects")
        for entry in _as_list(cv_profile.get(section))
    ]
    for mention in skills_from_lines(evidence_lines):
        key = mention["canonical"].casefold()
        if key not in seen_cv_skills:
            cv_skills.append(mention)
            seen_cv_skills.add(key)

    matched, missing = assign_skills(required, preferred, cv_skills)
    skill_denominator = 2 * len(required) + len(preferred)
    skill_numerator = sum(
        (2 if item["priority"] == "required" else 1) * item["confidence"] for item in matched
    )
    skill_score = 100 * skill_numerator / skill_denominator if skill_denominator else None
    skill_reason = (
        f"{len(required)} yêu cầu kỹ năng bắt buộc × 2; {len(preferred)} yêu cầu ưu tiên × 1. "
        "Exact = 100%; alias = 95%; TF-IDF cosine/RapidFuzz theo độ giống; "
        "semantic theo taxonomy = 80%."
        if skill_denominator
        else "JD không nêu kỹ năng để chấm."
    )

    required_years, jd_year_evidence = _years_from_text(_strings(requirements.get("experience")))
    experience_entries = _as_list(cv_profile.get("experience"))
    cv_years, cv_year_evidence = _cv_years(experience_entries, as_of)
    if required_years is None or required_years <= 0:
        experience_score = None
        experience_reason = "JD không nêu số năm kinh nghiệm; tiêu chí N/A."
    elif cv_years is None and experience_entries:
        experience_score = None
        experience_reason = (
            "CV có kinh nghiệm nhưng không đủ ngày hoặc số năm để định lượng; tiêu chí N/A."
        )
    else:
        experience_score = min((cv_years or 0) / required_years, 1) * 100
        experience_reason = f"min({round(cv_years or 0, 2)} / {required_years:g}, 1) × 100."

    jd_education_lines = _strings(requirements.get("education"))
    jd_field_lines = _strings(requirements.get("fields_of_study"))
    jd_education_text = " | ".join(jd_education_lines + jd_field_lines)
    jd_degree = _degree(jd_education_text)
    jd_fields = _fields(jd_education_text)
    cv_education_entries = _as_list(cv_profile.get("education"))
    cv_education_text = " | ".join(_entry_text(entry) for entry in cv_education_entries)
    cv_degree = _degree(cv_education_text, cv=True)
    if not cv_degree and re.search(
        r"university|college|đại học|học viện|cao đẳng", cv_education_text, re.IGNORECASE
    ):
        cv_degree = "student"  # Enrollment is evidence of study, not a completed degree.
    cv_fields = _fields(cv_education_text)
    degree_ok = jd_degree is None or (
        cv_degree is not None and DEGREE_RANK[cv_degree] >= DEGREE_RANK[jd_degree]
    )
    field_ok = not jd_fields or bool(set(jd_fields) & set(cv_fields))
    if not jd_degree and not jd_fields:
        education_score = None
        education_reason = "JD không có yêu cầu học vị/ngành học có thể so khớp; tiêu chí N/A."
    else:
        education_score = 100.0 if degree_ok and field_ok else 0.0
        education_reason = (
            f"Học vị JD: {jd_degree or 'không yêu cầu'}; CV: {cv_degree or 'không xác định'}. "
            f"Ngành JD: {', '.join(jd_fields) or 'không yêu cầu'}; "
            f"CV: {', '.join(cv_fields) or 'không xác định'}."
        )

    jd_skills = required + preferred
    project_entries = _as_list(cv_profile.get("projects"))
    project_matches = []
    for jd_skill in jd_skills:
        best = None
        for entry in project_entries:
            text = _entry_text(entry)
            for mention in skill_mentions(text):
                for option in jd_skill["options"]:
                    result = match_tier(option["name"], mention["name"])
                    if result and result[0] in {"exact", "normalized"}:
                        best = {
                            "jd_skill": jd_skill["name"],
                            "jd_option": option["name"],
                            "project_skill": mention["name"],
                            "project_evidence": text,
                            "tier": result[0],
                        }
                        break
                if best:
                    break
            if best:
                break
        if best:
            project_matches.append(best)
    project_score = 100 * len(project_matches) / len(jd_skills) if jd_skills else None
    project_reason = (
        f"{len(project_matches)}/{len(jd_skills)} kỹ năng JD xuất hiện trong mục Projects của CV "
        f"(exact/normalized); tối đa +{PROJECT_BONUS_MAX:g} điểm, không trừ điểm khi thiếu."
        if jd_skills
        else "JD không nêu kỹ năng để đối chiếu với Projects; không có điểm cộng."
    )

    scores = {
        "job_fit": _metric(
            job_fit_score,
            WEIGHTS["job_fit"],
            job_fit_reason,
            {"tasks": responsibility_matches},
        ),
        "skill_match": _metric(
            skill_score,
            WEIGHTS["skill_match"],
            skill_reason,
            {
                "required": required,
                "preferred": preferred,
                "cv_skills": cv_skills,
                "matched": matched,
            },
        ),
        "experience_match": _metric(
            experience_score,
            WEIGHTS["experience_match"],
            experience_reason,
            {
                "jd_required_years": required_years,
                "cv_years": cv_years,
                "jd_text": jd_year_evidence,
                "cv_entries": cv_year_evidence,
            },
        ),
        "education_match": _metric(
            education_score,
            WEIGHTS["education_match"],
            education_reason,
            {
                "jd_text": jd_education_lines + jd_field_lines,
                "cv_entries": [_entry_text(entry) for entry in cv_education_entries],
                "jd_degree": jd_degree,
                "cv_degree": cv_degree,
                "jd_fields": jd_fields,
                "cv_fields": cv_fields,
                "degree_match": degree_ok if jd_degree else None,
                "field_match": field_ok if jd_fields else None,
            },
        ),
        "project_relevance": _metric(
            project_score,
            WEIGHTS["project_relevance"],
            project_reason,
            {
                "jd_skills": jd_skills,
                "matched": project_matches,
                "cv_projects": [_entry_text(entry) for entry in project_entries],
            },
        ),
    }
    active_weight = sum(
        metric["base_weight"] for metric in scores.values() if metric["score"] is not None
    )
    for metric in scores.values():
        if metric["score"] is not None and active_weight:
            metric["effective_weight"] = round(metric["base_weight"] / active_weight, 4)
            metric["weighted_points"] = round(
                metric["score"] * metric["base_weight"] / active_weight, 2
            )
    base_score = (
        round(
            sum(
                metric["score"] * metric["base_weight"]
                for metric in scores.values()
                if metric["score"] is not None
            )
            / active_weight,
            1,
        )
        if active_weight
        else None
    )
    project_bonus_points = (
        round(PROJECT_BONUS_MAX * len(project_matches) / len(jd_skills), 2) if jd_skills else 0.0
    )
    applied_bonus_points = (
        round(min(project_bonus_points, max(100 - base_score, 0)), 2)
        if base_score is not None
        else 0.0
    )
    scores["project_relevance"]["weighted_points"] = applied_bonus_points
    overall = round(base_score + applied_bonus_points, 1) if base_score is not None else None
    other_requirements = compare_other_requirements(cv_profile, jd_profile)
    return {
        "matcher_version": "1.2.0",
        "taxonomy_version": taxonomy()["version"],
        "as_of": as_of.isoformat(),
        "scores": scores,
        "job_fit": scores["job_fit"]["score"],
        "skill_match": scores["skill_match"]["score"],
        "experience_match": scores["experience_match"]["score"],
        "education_match": scores["education_match"]["score"],
        "project_relevance": scores["project_relevance"]["score"],
        "overall_score": overall,
        "base_score": base_score,
        "project_bonus_points": project_bonus_points,
        "project_bonus_applied_points": applied_bonus_points,
        "matched_skills": matched,
        "missing_required_skills": missing,
        "project_matches": project_matches,
        "other_requirements": other_requirements,
        "responsibility_matches": responsibility_matches,
        "warnings": (
            [
                "Thiếu kỹ năng bắt buộc: "
                + ", ".join(missing)
                + ". Điểm số chỉ hỗ trợ đánh giá, không tự động loại ứng viên."
            ]
            if missing
            else []
        ),
    }
