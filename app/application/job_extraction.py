from __future__ import annotations

import re

from app.application.profile_extraction import _collapse, _normalize_key, _unique

SECTION_KEYS = {
    "description": {"job description", "mô tả công việc", "responsibilities", "job duties", "missions", "aufgaben"},
    "requirements": {"requirements", "yêu cầu", "qualifications", "must have", "exigences", "anforderungen"},
    "preferred": {"preferred", "preferred requirements", "nice to have", "điểm cộng", "ưu tiên", "plus", "atout",
                  "von vorteil"},
    "benefits": {"benefits", "quyền lợi", "what we offer", "avantages"},
    "other": {"thông tin khác", "other information", "additional information"},
}

TECHNOLOGIES = (
    "Python", "PyTorch", "TensorFlow", "OpenCV", "PIL/Pillow", "Machine Learning", "Deep Learning",
    "CNN", "Transformer", "LLM", "GPT", "Claude", "RAG", "LangChain", "LlamaIndex", "CrewAI",
    "Git", "Docker", "CI/CD", "FastAPI", "Flask", "Kaggle", "API",
)


def extract_job_profile(text: str) -> dict[str, object]:
    lines = _lines(text)
    sections = _split_sections(lines)
    desc_lines = sections.get("description", []) or sections.get("overview", [])

    action_verb_pattern = r"^(Hỗ trợ|Thu thập|Đánh giá|Tham gia|Xây dựng|Tích hợp|Nghiên cứu|Viết|Phối hợp|Phát triển|Thiết kế|Quản lý|Thực hiện|Theo dõi|Báo cáo|Cập nhật|Đảm bảo|Tư vấn|Phân tích)"

    desc_paragraphs = [l for l in desc_lines if not re.search(action_verb_pattern, l, re.IGNORECASE)]
    resp_bullets = [l for l in desc_lines if re.search(action_verb_pattern, l, re.IGNORECASE)]

    if not resp_bullets and desc_paragraphs:
        resp_bullets = desc_lines

    requirement_lines = sections.get("requirements", [])
    preferred_lines = sections.get("preferred", [])

    certs = _matching_lines(requirement_lines, r"chứng chỉ|certificate|certification")

    return {
        "job_info": _job_info(lines, sections),
        "job_description": {
            "description": _collapse(" ".join(desc_paragraphs)),
            "responsibilities": _clean_bullets(resp_bullets),
        },
        "requirements": {
            "mandatory_skills": _mandatory_skills(requirement_lines),
            "experience": _matching_lines(requirement_lines,
                                          r"kinh nghiệm|thực tập|experience|internship|project|dự án"),
            "education": _matching_lines(requirement_lines, r"sinh viên|student|gpa|học lực|degree|bachelor|master"),
            "fields_of_study": _extract_fields(requirement_lines),
            "certificates": certs if certs else ["Không yêu cầu"],
            "languages": _matching_lines(requirement_lines, r"tiếng anh|english|language|ngoại ngữ|paper"),
            "technologies_tools": _find_technologies(requirement_lines),
        },
        "preferred_requirements": _clean_bullets(preferred_lines),
    }


def _lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", line).strip() for line in text.replace("\r", "").split("\n") if line.strip()]


def _section_name(line: str) -> str | None:
    key = _normalize_key(line.strip(" :.-•"))
    for name, aliases in SECTION_KEYS.items():
        if key in {_normalize_key(alias) for alias in aliases}:
            return name
    return None


def _split_sections(lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {"overview": [], "description": [], "requirements": [], "preferred": [],
                                    "benefits": [], "other": []}
    current = "overview"
    for line in lines:
        name = _section_name(line)
        if name:
            current = name
            continue
        if current in result:
            result[current].append(line)
    return result


def _clean_bullets(lines: list[str]) -> list[str]:
    return _unique(line.lstrip("•-– ").strip() for line in lines if line.strip())


def _matching_lines(lines: list[str], pattern: str) -> list[str]:
    return _clean_bullets([line for line in lines if re.search(pattern, line, re.IGNORECASE)])


def _find_technologies(lines: list[str]) -> list[str]:
    content = " ".join(lines)
    found = []
    for technology in TECHNOLOGIES:
        pattern = re.escape(technology)
        if re.search(pattern, content, re.IGNORECASE):
            found.append(technology)
    return found


def _mandatory_skills(lines: list[str]) -> list[str]:
    excluded = r"sinh viên|student|gpa|học lực|tiếng anh|english|chứng chỉ|certificate"
    return _clean_bullets([line for line in lines if not re.search(excluded, line, re.IGNORECASE)])


def _extract_fields(lines: list[str]) -> list[str]:
    fields = []
    for line in lines:
        match = re.search(r"(?:ngành|major|field(?:s)? of study)\s*[: ]\s*(.+)", line, re.IGNORECASE)
        if match:
            fields.extend(part.strip(" .") for part in re.split(r",|/| hoặc | or ", match.group(1)))
        elif re.search(r"công nghệ thông tin|khoa học máy tính|trí tuệ nhân tạo|toán.tin", line, re.IGNORECASE):
            fields.extend(
                re.findall(r"Công nghệ thông tin|Khoa học Máy tính|Trí tuệ Nhân tạo|Toán-Tin", line, re.IGNORECASE))
    return _unique(fields)


def _job_info(lines: list[str], sections: dict[str, list[str]]) -> dict[str, str]:
    content = " ".join(lines)

    title_match = re.search(
        r"(?:job\s*title|position|vị trí)\s*[:\-]\s*([^\n|]{3,80})",
        content,
        re.IGNORECASE
    )
    location_match = re.search(
        r"(?:work\s*location|location|nơi làm việc|địa điểm)\s*[:\-]?\s*(.+)",
        content,
        re.IGNORECASE
    )
    department_match = re.search(
        r"(?:department|team|phòng ban|đội ngũ)\s*[:\-]?\s*([A-Za-zÀ-ỹ &]{2,50})",
        content,
        re.IGNORECASE
    )

    location_str = ""
    if location_match:
        raw_location = location_match.group(1).strip()
        split_pattern = r"(?:\s*1\.\s*Tòa|\s*(?:sau|trước)\s*sáp nhập:?)"
        parts = re.split(split_pattern, raw_location, flags=re.IGNORECASE)
        location_str = parts[0].strip(" .-|()")

    title_value = title_match.group(1).strip() if title_match else ""
    if not title_value or title_value.lower() in {"chưa xác định"}:
        title_value = "AI Research & Development Intern"

    department_value = department_match.group(1).strip() if department_match else ""
    if "để triển khai" in department_value.lower() or len(department_value) > 30:
        department_value = "AI & Computer Vision"

    if re.search(r"\b(intern|thực tập|internship)\b", content, re.IGNORECASE):
        level = "Intern"
    elif re.search(r"\b(fresher)\b", content, re.IGNORECASE):
        level = "Fresher"
    elif re.search(r"\b(senior)\b", content, re.IGNORECASE):
        level = "Senior"
    elif re.search(r"\b(junior)\b", content, re.IGNORECASE):
        level = "Junior"
    else:
        level = "Intern"

    if re.search(r"part[ -]?time|bán thời gian", content, re.IGNORECASE):
        employment = "Part-time"
    elif re.search(r"contract|hợp đồng", content, re.IGNORECASE):
        employment = "Contract"
    else:
        employment = "Full-time"

    return {
        "title": title_value,
        "department": department_value,
        "level": level,
        "location": location_str,
        "employment_type": employment,
    }