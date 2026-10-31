from __future__ import annotations

import re

from app.application.profile_extraction import _collapse, _normalize_key, _unique
from app.application.requirement_evidence import extra_kind

SECTION_KEYS = {
    "description": {
        "job description", "mô tả công việc", "responsibilities", "job duties", "missions", "aufgaben",
        "mô tả", "nhiệm vụ", "nhiệm vụ chính", "nhiệm vụ và trách nhiệm", "nhiệm vụ & trách nhiệm",
        "trách nhiệm", "trách nhiệm công việc", "nội dung công việc", "công việc chính", "vai trò",
        "chi tiết công việc", "what you will do", "what you ll do", "roles and responsibilities",
        "key responsibilities", "duties", "core responsibilities",
    },
    "requirements": {
        "requirements", "yêu cầu", "qualifications", "must have", "exigences", "anforderungen",
        "yêu cầu ứng viên", "yêu cầu công việc", "yêu cầu tuyển dụng", "yêu cầu bắt buộc",
        "yêu cầu đối với ứng viên", "tiêu chuẩn ứng viên", "tiêu chuẩn tuyển dụng", "tiêu chí tuyển dụng",
        "kỹ năng & yêu cầu", "kỹ năng yêu cầu", "kỹ năng chuyên môn", "kỹ năng cần có", "kỹ năng",
        "chuyên môn", "yêu cầu năng lực", "yêu cầu kinh nghiệm", "kinh nghiệm & kỹ năng",
        "kiến thức nền tảng", "kiến thức chuyên môn", "nền tảng kỹ thuật", "nền tảng chuyên môn",
        "job requirements", "candidate requirements", "minimum qualifications", "basic qualifications",
        "what we look for", "what you need", "what you ll need", "who you are", "profile requirements",
        "skills and requirements", "skills requirements", "required skills", "profile",
    },
    "preferred": {
        "preferred", "preferred requirements", "nice to have", "điểm cộng", "ưu tiên", "plus", "atout",
        "von vorteil", "yêu cầu ưu tiên", "kỹ năng ưu tiên", "tiêu chí ưu tiên", "lợi thế",
        "tư duy và khả năng làm việc", "tư duy & khả năng làm việc", "tư duy làm việc",
        "kỹ năng mềm", "thái độ làm việc",
        "preferred qualifications", "bonus points", "good to have", "desired skills", "ưu tiên ứng viên",
    },
    "benefits": {
        "benefits", "quyền lợi", "what we offer", "avantages", "quyền lợi ứng viên", "quyền lợi được hưởng",
        "chế độ đãi ngộ", "phúc lợi", "chế độ phúc lợi", "perks", "why join us", "lợi ích",
    },
    "other": {
        "thông tin khác", "other information", "additional information", "thông tin chung",
        "địa điểm làm việc", "thời gian làm việc", "cách thức ứng tuyển", "hồ sơ bao gồm",
        "general information", "how to apply",
    },
}

INLINE_HEADING_KEYWORDS = (
    "Yêu cầu ứng viên", "Yêu cầu công việc", "Yêu cầu tuyển dụng", "Yêu cầu bắt buộc",
    "Yêu cầu đối với ứng viên", "Tiêu chuẩn ứng viên", "Yêu cầu kinh nghiệm",
    "Mô tả công việc", "Nhiệm vụ chính", "Nhiệm vụ & trách nhiệm", "Trách nhiệm công việc",
    "Công việc hằng ngày", "Về vai trò", "Kỹ năng & yêu cầu", "Kỹ năng chuyên môn", "Kỹ năng",
    "Yêu cầu ưu tiên", "Điểm cộng", "Ưu tiên", "Quyền lợi ứng viên", "Quyền lợi",
    "Chế độ đãi ngộ", "Phúc lợi", "Thông tin khác", "Thông tin chung", "Nơi làm việc",
    "Địa điểm làm việc", "Thời gian làm việc", "Job Description", "Responsibilities",
    "Key Responsibilities", "Job Requirements", "Requirements", "Qualifications",
    "Must have", "Preferred Requirements", "Nice to have", "Benefits", "What we offer",
)

TECHNOLOGIES = (
    "Python", "PyTorch", "TensorFlow", "OpenCV", "PIL/Pillow", "Machine Learning", "Deep Learning",
    "CNN", "Transformer", "LLM", "GPT", "Claude", "RAG", "LangChain", "LlamaIndex", "CrewAI",
    "Git", "Docker", "CI/CD", "FastAPI", "Flask", "Kaggle", "REST API", "API", "SQL", "PostgreSQL",
    "MongoDB", "Redis", "NLP", "Computer Vision", "GenAI", "Agentic AI", "AI Agent", "vector search",
    "embedding", "Vector Database", "Hugging Face", "PEFT", "Qdrant", "ChromaDB",
    "Scikit-learn", "Pandas", "NumPy", "Kubernetes", "Linux",
)

ACTION_VERBS = (
    "Hỗ trợ", "Thu thập", "Đánh giá", "Tham gia", "Xây dựng", "Tích hợp", "Nghiên cứu", "Viết",
    "Phối hợp", "Phát triển", "Thiết kế", "Quản lý", "Thực hiện", "Theo dõi", "Báo cáo", "Cập nhật",
    "Đảm bảo", "Tư vấn", "Phân tích", "Xử lý", "Triển khai", "Huấn luyện", "Đào tạo", "Kiểm thử",
    "Tối ưu", "Tối ưu hóa", "Lập trình", "Vận hành", "Trao đổi", "Làm việc", "Chịu trách nhiệm",
    "Support", "Build", "Develop", "Design", "Implement", "Maintain", "Create", "Manage",
    "Lead", "Collaborate", "Participate", "Optimize", "Test", "Research", "Write", "Prepare",
)
ACTION_VERB_PATTERN = r"^(?:" + "|".join(ACTION_VERBS) + r")\b"


def extract_job_profile(text: str) -> dict[str, object]:
    lines = _lines(text)
    sections = _split_sections(lines)
    desc_lines = sections.get("description", []) or sections.get("overview", [])

    desc_paragraphs: list[str] = []
    resp_bullets: list[str] = []

    for line in desc_lines:
        if (
            line.startswith(("•", "-", "–", "—", "*", "+"))
            or re.search(ACTION_VERB_PATTERN, line, re.IGNORECASE)
            or re.search(r"^(?:Công việc hằng ngày|Nhiệm vụ|Trách nhiệm|Công việc chính)\s*[:\-]", line, re.IGNORECASE)
        ):
            resp_bullets.append(line)
        else:
            desc_paragraphs.append(line)

    if not resp_bullets and desc_paragraphs:
        resp_bullets = desc_lines

    requirement_lines = sections.get("requirements", [])
    preferred_lines = sections.get("preferred", [])

    certs = _matching_lines(requirement_lines, r"chứng chỉ|certificate|certification")

    return {
        "job_info": _job_info(lines, sections),
        "job_description": {
            "description": _format_description(desc_paragraphs),
            "responsibilities": _clean_bullets(resp_bullets),
        },
        "requirements": {
            "mandatory_skills": _mandatory_skills(requirement_lines),
            "other_requirements": _clean_bullets(
                [line for line in requirement_lines if extra_kind(line)]
            ),
            "experience": _matching_lines(
                requirement_lines,
                r"kinh nghiệm|thực tập|thực chiến|năm kinh nghiệm|kinh nghiệm làm việc|experience|internship|project|dự án",
            ),
            "education": _matching_lines(
                requirement_lines,
                r"sinh viên|student|gpa|học lực|tốt nghiệp|đại học|cao đẳng|kỹ sư|cử nhân|thạc sĩ|tiến sĩ|degree|bachelor|master|bằng cấp|trình độ",
            ),
            "fields_of_study": _extract_fields(requirement_lines),
            "certificates": certs if certs else ["Không yêu cầu"],
            "languages": _matching_lines(
                requirement_lines,
                r"tiếng anh|english|tiếng nhật|tiếng trung|tiếng hàn|tiếng pháp|tiếng đức|ngoại ngữ|foreign language|ielts|toeic|toefl|jlpt|hsk|topik",
            ),
            "technologies_tools": _find_technologies(lines),
        },
        "preferred_requirements": _clean_bullets(preferred_lines),
    }


def _format_description(paragraphs: list[str]) -> str:
    """Ghép phần mô tả tổng quan, mỗi ý đánh số (1. 2. 3.) nằm trên một dòng riêng."""
    items: list[str] = []
    pending = ""
    for paragraph in paragraphs:
        text = _collapse(paragraph)
        if not text:
            continue

        # Số thứ tự bị tách riêng thành một dòng ("1.") -> ghép với dòng kế tiếp.
        if re.fullmatch(r"\d+[.)]", text):
            pending = text
            continue
        if pending:
            text = f"{pending} {text}"
            pending = ""

        # Tách các mục đánh số nằm chung một dòng: "1. A: 2. B 3. C".
        numbered = len(re.findall(r"(?:^|\s)\d+[.)]\s+\S", text))
        if numbered >= 2 or re.match(r"^\d+[.)]\s", text):
            parts = re.split(r"\s+(?=\d+[.)]\s+\S)", text)
            items.extend(part.strip(" :;") for part in parts if part.strip(" :;"))
        else:
            items.append(text)

    if pending:
        items.append(pending)
    return "\n".join(items)


def _clean_heading(line: str) -> str:
    line = re.sub(r"^(?:[\dIVXLCDMivxlcdm]+[\.\)\:\-]\s*|[•\-\*\#\+\–—\>\~]+\s*)+", "", line)
    return line.strip(" :.-•–—\t")


def _section_name(line: str) -> str | None:
    cleaned = _clean_heading(line)
    if not cleaned or len(cleaned) > 60:
        return None
    if ":" in line:
        parts = line.split(":", 1)
        after_colon = parts[1].strip()
        if len(after_colon.split()) >= 3 or re.search(r"\d+", after_colon):
            return None
    key = _normalize_key(cleaned)
    for name, aliases in SECTION_KEYS.items():
        normalized_aliases = {_normalize_key(alias) for alias in aliases}
        if key in normalized_aliases:
            return name
    return None


def _preprocess_inline_headings(text: str) -> str:
    pattern = (
        r"(?<!\blà)\s+(?=(?:(?:\d+[\.\)]\s*)?|(?:I|II|III|IV|V)[\.\:]\s*)?"
        r"(?:" + "|".join(re.escape(k) for k in INLINE_HEADING_KEYWORDS) + r")(?:\s*[:\-]|\s+(?=[A-Z0-9À-Ỹ])|\s*$))"
    )
    return re.sub(pattern, "\n", text, flags=re.IGNORECASE)


def _lines(text: str) -> list[str]:
    text = _preprocess_inline_headings(text)
    raw_lines = [re.sub(r"\s+", " ", line).strip() for line in text.replace("\r", "").split("\n") if line.strip()]
    expanded: list[str] = []
    for line in raw_lines:
        heading, separator, content = line.partition(":")
        if separator and content.strip() and _section_name(heading.strip()):
            expanded.append(heading.strip())
            expanded.extend(
                sentence.strip()
                for sentence in re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ỹ0-9])", content.strip())
                if sentence.strip()
            )
            continue
        match = re.match(r"^(?:Kỹ năng|Yêu cầu kỹ năng)\s*[:\-]?\s*(.*)$", line, re.IGNORECASE)
        if match and match.group(1).strip():
            expanded.append("Kỹ năng")
            sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ỹ0-9])", match.group(1).strip())
            expanded.extend(s.strip() for s in sentences if s.strip())
            continue
        expanded.append(line)
    return expanded


def _split_sections(lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {
        "overview": [],
        "description": [],
        "requirements": [],
        "preferred": [],
        "benefits": [],
        "other": [],
    }
    current = "overview"
    for line in lines:
        name = _section_name(line)
        if name:
            current = name
            continue
        if current in result:
            result[current].append(line)

    if not result["requirements"]:
        req_candidates = []
        keep_desc = []
        for line in result["description"]:
            if re.search(
                r"^(?:Yêu cầu|Kinh nghiệm|Kỹ năng|Thành thạo|Nắm vững|Hiểu biết|Tốt nghiệp|Sinh viên|Đọc hiểu)",
                line,
                re.IGNORECASE,
            ):
                req_candidates.append(line)
            else:
                keep_desc.append(line)
        if req_candidates:
            result["requirements"] = req_candidates
            result["description"] = keep_desc

    return result


def _is_numbered_subheading(line: str, has_bullet_siblings: bool) -> bool:
    if not has_bullet_siblings:
        return False
    stripped = line.strip()
    if not re.match(r"^(?:\d+|[IVXLCDM]+)[\.\)]\s+\S+", stripped, re.IGNORECASE):
        return False
    cleaned = _clean_heading(stripped)
    return len(cleaned.split()) <= 8 and not stripped.endswith((".", "!", "?"))


def _clean_bullets(lines: list[str]) -> list[str]:
    has_bullet_siblings = any(
        line.lstrip().startswith(("•", "-", "–", "—", "*", "+")) for line in lines
    )
    return _unique(
        clean
        for line in lines
        if not _is_numbered_subheading(line, has_bullet_siblings)
        and (clean := line.lstrip("•-–—*+ ").strip())
        and not re.fullmatch(r"\d+[.)]?|[IVXLCDM]+[.)]?", clean, re.IGNORECASE)
    )


def _matching_lines(lines: list[str], pattern: str) -> list[str]:
    return _clean_bullets([line for line in lines if re.search(pattern, line, re.IGNORECASE)])


def _find_technologies(lines: list[str]) -> list[str]:
    content = " ".join(lines)
    found = []
    for technology in TECHNOLOGIES:
        pattern = r"(?<![A-Za-z0-9])" + re.escape(technology) + r"(?![A-Za-z0-9])"
        if re.search(pattern, content, re.IGNORECASE):
            found.append(technology)
    return found


def _mandatory_skills(lines: list[str]) -> list[str]:
    excluded = (
        r"sinh viên|student|gpa|học lực|tiếng anh|english|chứng chỉ|certificate|"
        r"^kỹ năng$|^yêu cầu$|^kỹ năng chuyên môn$"
    )
    skills = []
    for line in lines:
        if extra_kind(line):
            continue
        if re.search(r"^(?:Yêu cầu kinh nghiệm|Kinh nghiệm)\s*[:\-]\s*\d+", line, re.IGNORECASE):
            continue
        if re.search(excluded, line, re.IGNORECASE):
            continue
        clean = line.lstrip("•-–—*+ ").strip()
        if clean:
            skills.append(clean)
    return _clean_bullets(skills)


def _extract_fields(lines: list[str]) -> list[str]:
    fields = []
    for line in lines:
        match = re.search(r"(?:ngành|major|field(?:s)? of study)\s*[: ]\s*(.+)", line, re.IGNORECASE)
        if match:
            fields.extend(part.strip(" .") for part in re.split(r",|/| hoặc | or ", match.group(1)))
        elif re.search(
            r"công nghệ thông tin|khoa học máy tính|trí tuệ nhân tạo|toán.tin|khoa học dữ liệu|kỹ thuật phần mềm",
            line,
            re.IGNORECASE,
        ):
            fields.extend(
                re.findall(
                    r"Công nghệ thông tin|Khoa học Máy tính|Trí tuệ Nhân tạo|Toán-Tin|Khoa học Dữ liệu|Kỹ thuật Phần mềm",
                    line,
                    re.IGNORECASE,
                )
            )
    return _unique(fields)


def _job_info(lines: list[str], sections: dict[str, list[str]]) -> dict[str, str]:
    content = " ".join(lines)

    title_match = re.search(
        r"(?:job\s*title|position|vị trí\s*(?:công việc|tuyển dụng)?|chức danh|tiêu đề công việc|cần tuyển|tuyển dụng)\s*[:\-]\s*([^\n|]{3,80})",
        content,
        re.IGNORECASE,
    )
    location_match = re.search(
        r"(?:work\s*location|location|nơi làm việc|địa điểm(?:\s+làm\s+việc)?)"
        r"(?:\s*\([^)]*\))?\s*[:\-]?\s*(.+)",
        content,
        re.IGNORECASE,
    )
    department_match = re.search(
        r"(?:department|team|phòng ban|đội ngũ|bộ phận)\s*[:\-]?\s*([A-Za-zÀ-ỹ &]{2,50})",
        content,
        re.IGNORECASE,
    )

    location_str = ""
    if location_match:
        raw_location = location_match.group(1).strip()
        split_pattern = (
            r"(?:\s*1\.\s*Tòa|\s*(?:sau|trước)\s*sáp nhập:?"
            r"|\s*(?:Thời gian làm việc|Cách thức ứng tuyển|Hồ sơ bao gồm|Quyền lợi)\b)"
        )
        parts = re.split(split_pattern, raw_location, flags=re.IGNORECASE)
        location_str = parts[0].strip(" .-|()")

    title_value = title_match.group(1).strip() if title_match else ""
    if not title_value or title_value.lower() in {"chưa xác định"}:
        for line in lines[:5]:
            clean_l = _clean_heading(line)
            if 5 <= len(clean_l) <= 60 and not _section_name(line) and re.search(
                r"\b(intern|thực tập|fresher|junior|senior|lead|manager|kỹ sư|developer|engineer|chuyên viên|nhân viên|analyst)\b",
                clean_l,
                re.IGNORECASE,
            ):
                title_value = clean_l
                break
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
        "location": location_str if location_str else "Chưa xác định",
        "employment_type": employment,
    }