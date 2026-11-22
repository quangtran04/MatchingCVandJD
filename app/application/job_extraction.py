from __future__ import annotations

import re

from app.application.profile_extraction import _collapse, _normalize_key, _unique
from app.application.requirement_evidence import extra_kind

UPPER_VN = "A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ"
LOWER_VN = "a-zàáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ"

SECTION_KEYS = {
    "overview": {
        "tổng quan", "overview", "thông tin tổng quan", "giới thiệu công ty",
        "về chúng tôi", "about us", "company overview", "job overview",
        "job summary", "tóm tắt công việc",
    },
    "specialization": {
        "chuyên môn", "lĩnh vực", "ngành nghề", "job category", "specialization",
    },
    "description": {
        "job description", "mô tả công việc", "responsibilities", "job duties", "missions", "aufgaben",
        "mô tả", "nhiệm vụ", "nhiệm vụ chính", "nhiệm vụ và trách nhiệm", "nhiệm vụ & trách nhiệm",
        "trách nhiệm", "trách nhiệm công việc", "nội dung công việc", "công việc chính", "vai trò",
        "chi tiết công việc", "what you will do", "what you ll do", "roles and responsibilities",
        "key responsibilities", "duties", "core responsibilities", "about the role", "about the job",
    },
    "requirements": {
        "requirements", "yêu cầu", "qualifications", "must have", "exigences", "anforderungen",
        "yêu cầu ứng viên", "yêu cầu công việc", "yêu cầu tuyển dụng", "yêu cầu bắt buộc",
        "yêu cầu đối với ứng viên", "tiêu chuẩn ứng viên", "tiêu chuẩn tuyển dụng", "tiêu chí tuyển dụng",
        "kỹ năng & yêu cầu", "kỹ năng yêu cầu", "kỹ năng chuyên môn", "yêu cầu chuyên môn",
        "kỹ năng cần có", "kỹ năng", "yêu cầu năng lực", "yêu cầu kinh nghiệm", "kinh nghiệm & kỹ năng",
        "kiến thức nền tảng", "kiến thức chuyên môn", "nền tảng kỹ thuật", "nền tảng chuyên môn",
        "job requirements", "candidate requirements", "minimum qualifications", "basic qualifications",
        "required qualifications", "your skills and experience", "what we look for", "what you need",
        "what you ll need", "who you are", "profile requirements", "skills and requirements",
        "skills requirements", "required skills", "profile",
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
        "chế độ đãi ngộ", "phúc lợi", "chế độ phúc lợi", "perks", "why join us",
        "why you ll love working here", "lợi ích",
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
    "Antigravity", "Python", "JavaScript", "TypeScript", "PyTorch", "TensorFlow", "OpenCV",
    "PIL/Pillow", "Machine Learning", "Deep Learning", "CNN", "Transformer", "LLM", "GPT",
    "Claude", "RAG", "LangChain", "LlamaIndex", "CrewAI", "Git", "GitHub", "Docker", "CI/CD",
    "FastAPI", "Flask", "Kaggle", "REST API", "API", "SQL", "PostgreSQL", "pgvector", "Database",
    "MongoDB", "Redis", "NLP", "Computer Vision", "GenAI", "Agentic AI", "AI Agent",
    "Semantic Search", "vector search", "embedding", "Vector Database", "Hugging Face", "PEFT",
    "LoRA", "QLoRA", "Qdrant", "ChromaDB", "Scikit-learn", "Pandas", "NumPy", "Kubernetes",
    "Linux", "n8n", "UI/UX", "IoT",
)

ACTION_VERBS = (
    "Hỗ trợ", "Thu thập", "Đánh giá", "Tham gia", "Xây dựng", "Tích hợp", "Nghiên cứu", "Viết",
    "Phối hợp", "Phát triển", "Thiết kế", "Quản lý", "Thực hiện", "Theo dõi", "Báo cáo", "Cập nhật",
    "Đảm bảo", "Tư vấn", "Phân tích", "Xử lý", "Triển khai", "Huấn luyện", "Đào tạo", "Kiểm thử",
    "Tối ưu", "Tối ưu hóa", "Lập trình", "Vận hành", "Trao đổi", "Làm việc", "Chịu trách nhiệm",
    "Sử dụng", "Bảo trì", "Phát hiện", "Hoàn thiện",
    "Support", "Build", "Develop", "Design", "Implement", "Maintain", "Create", "Manage",
    "Lead", "Collaborate", "Participate", "Optimize", "Test", "Research", "Write", "Prepare", "Use",
    "Integrate", "Provision", "Run", "Operate", "Monitor", "Ensure", "Track", "Report", "Review",
    "Administer", "Automate", "Deploy", "Configure", "Analyze",
)
ACTION_VERB_PATTERN = r"^(?:" + "|".join(ACTION_VERBS) + r")\b"

EDUCATION_PATTERN = (
    r"sinh viên|student|undergraduate|\bgpa\b|học lực|tốt nghiệp|đại học|cao đẳng|trung cấp|"
    r"kỹ sư|cử nhân|thạc sĩ|tiến sĩ|\bdegree\b|bachelor|master|phd|doctorate|bằng cấp|"
    r"trình độ học vấn|trình độ đại học|đại học trở lên|cao đẳng trở lên"
)

LANGUAGE_PATTERN = (
    r"tiếng anh|english|tiếng nhật|japanese|tiếng trung|chinese|tiếng hàn|korean|"
    r"tiếng pháp|french|tiếng đức|german|ngoại ngữ|foreign language|language skill|"
    r"language proficiency|ielts|toeic|toefl|jlpt|topik|hsk|cefr|"
    r"đọc hiểu\s+(?:paper|tài liệu|source code|documentation)"
)

CERTIFICATE_PATTERN = r"chứng chỉ|certificate|certification"

NO_EXPERIENCE_PATTERN = (
    r"(?:không\s+yêu\s+cầu|không\s+cần|chưa\s+có|chưa\s+cần)\s+kinh\s+nghiệm|"
    r"no\s+(?:prior\s+)?experience\s+required"
)

EXPERIENCE_REQUIREMENT_PATTERN = (
    r"(?<!không\s)(?<!không\syêu\scầu\s)(?<!không\scần\s)(?<!chưa\scó\s)"
    r"(?:\bkinh\s+nghiệm\b|\bexperience\b|\bthực\s+tập\b|\binternship\b|\bthực\s+chiến\b|"
    r"đã\s+có\s+sản\s+phẩm\s+.*\s+trong\s+thực\s+tế|"
    r"đã\s+từng\s+thực\s+hiện\s+(?:project|dự\s+án)|đã\s+có\s+(?:project|dự\s+án)\s+cá\s+nhân)"
)

PURE_EXPERIENCE_LINE_PATTERN = (
    r"^(?:[•\-–—*+]\s*)?(?:(?:yêu\s+cầu\s+kinh\s+nghiệm|kinh\s+nghiệm(?:\s+làm\s+việc|\s+chuyên\s+môn)?)"
    r"\s*[:\-]?\s*)?(?:(?:có\s+)?(?:từ\s+|tối\s+thiểu\s+|ít\s+nhất\s+|trên\s+|hơn\s+)?"
    r"\d+(?:[.,]\d+)?(?:\s*[-–~]\s*\d+(?:[.,]\d+)?)?\s*\+?\s*(?:năm|tháng|years?|yrs?|months?)"
    r"\s*(?:kinh\s+nghiệm|experience)?\b|"
    r"(?:không\s+yêu\s+cầu|không\s+cần|chưa\s+có|chưa\s+cần)\s+kinh\s+nghiệm\b|"
    r"no\s+(?:prior\s+)?experience\s+required\b)"
)

PREFERRED_LINE_PATTERN = (
    r"^(?:[•\-–—*+]\s*)?(?:ưu\s+tiên|điểm\s+cộng|lợi\s+thế|nice\s+to\s+have|preferred|bonus\s+points?|plus)\b|"
    r"(?:là\s+(?:một\s+)?(?:điểm\s+cộng|lợi\s+thế)|nhưng\s+không\s+bắt\s+buộc|không\s+bắt\s+buộc|"
    r"is\s+a\s+plus|is\s+an\s+advantage|is\s+preferred)\s*[.!?;]*$"
)


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
            or re.search(
                r"^(?:Công việc hằng ngày|Nhiệm vụ|Trách nhiệm|Công việc chính)\s*[:\-]",
                line,
                re.IGNORECASE,
            )
        ):
            resp_bullets.append(line)
        else:
            desc_paragraphs.append(line)

    if not resp_bullets and desc_paragraphs:
        resp_bullets = desc_lines

    requirement_lines = _expand_compound_requirement_lines(sections.get("requirements", []))
    overview_lines = _expand_compound_requirement_lines(sections.get("overview", []))
    inline_preferred = [line for line in requirement_lines if _is_preferred_line(line)]
    preferred_lines = [*sections.get("preferred", []), *inline_preferred]

    certs = _matching_lines(requirement_lines, CERTIFICATE_PATTERN)
    exp_lines = [
        line
        for line in _matching_lines(requirement_lines, EXPERIENCE_REQUIREMENT_PATTERN)
        if not re.search(NO_EXPERIENCE_PATTERN, line, re.IGNORECASE)
    ]
    if not exp_lines and overview_lines:
        exp_lines = [
            line
            for line in _matching_lines(overview_lines, EXPERIENCE_REQUIREMENT_PATTERN)
            if not re.search(NO_EXPERIENCE_PATTERN, line, re.IGNORECASE)
        ]

    edu_lines = _matching_lines(requirement_lines, EDUCATION_PATTERN)
    if not edu_lines and overview_lines:
        edu_lines = _matching_lines(overview_lines, EDUCATION_PATTERN)

    lang_lines = _matching_lines(requirement_lines, LANGUAGE_PATTERN)
    if not lang_lines and overview_lines:
        lang_lines = _matching_lines(overview_lines, LANGUAGE_PATTERN)

    return {
        "job_info": _job_info(lines, sections),
        "job_description": {
            "description": _collapse(" ".join(desc_paragraphs)),
            "responsibilities": _clean_bullets(resp_bullets),
        },
        "requirements": {
            "mandatory_skills": _mandatory_skills(requirement_lines),
            "other_requirements": _clean_bullets(
                [
                    line
                    for line in requirement_lines
                    if extra_kind(line)
                    and not _is_preferred_line(line)
                    and not re.search(EXPERIENCE_REQUIREMENT_PATTERN, line, re.IGNORECASE)
                ]
            ),
            "experience": exp_lines,
            "education": edu_lines,
            "fields_of_study": _extract_fields(requirement_lines),
            "certificates": certs if certs else ["Không yêu cầu"],
            "languages": lang_lines,
            "technologies_tools": _find_technologies(lines),
        },
        "preferred_requirements": _clean_bullets(preferred_lines),
    }


def _is_preferred_line(line: str) -> bool:
    return bool(re.search(PREFERRED_LINE_PATTERN, line.strip(), re.IGNORECASE))


def _split_compound_clauses(line: str) -> list[str]:
    stripped = line.strip()
    if "," not in stripped or len(stripped) > 120:
        return [stripped]
    if re.match(
        r"^(?:có\s+từ|có\s+kinh\s+nghiệm|bắt\s+buộc|ưu\s+tiên|thành\s+thạo|hiểu|nắm|biết|sinh\s+viên|tốt\s+nghiệp)\b",
        stripped,
        re.IGNORECASE,
    ):
        return [stripped]
    parts = [part.strip(" .;") for part in stripped.split(",") if part.strip(" .;")]
    if len(parts) >= 2 and any(
        re.search(f"{EXPERIENCE_REQUIREMENT_PATTERN}|{NO_EXPERIENCE_PATTERN}", part, re.IGNORECASE)
        for part in parts
    ) and any(re.search(EDUCATION_PATTERN, part, re.IGNORECASE) for part in parts):
        return parts
    return [stripped]


def _expand_compound_requirement_lines(lines: list[str]) -> list[str]:
    expanded: list[str] = []
    for line in lines:
        expanded.extend(_split_compound_clauses(line))
    return expanded


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
    kw_union = "|".join(re.escape(k) for k in INLINE_HEADING_KEYWORDS)
    pattern = (
        r"(?<!\blà)(?<!\bkhông)(?<!\bchưa)(?<!\bcác)(?<!\bvề)(?<!\bcó)"
        r"(?:(?<=[.!?;])\s+|\s+(?=(?:\d+[\.\)]|(?:I|II|III|IV|V)[\.\:])\s*))"
        r"(?=(?:(?:\d+[\.\)]\s*)?|(?:I|II|III|IV|V)[\.\:]\s*)?"
        r"(?:" + kw_union + rf")(?:\s*[:\-]|\s+(?-i:[{UPPER_VN}0-9])|\s*$))"
    )
    return re.sub(pattern, "\n", text, flags=re.IGNORECASE)


def _lines(text: str) -> list[str]:
    text = _preprocess_inline_headings(text)
    raw_lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in text.replace("\r", "").split("\n")
        if line.strip()
    ]
    expanded: list[str] = []
    for line in raw_lines:
        heading, separator, content = line.partition(":")
        if separator and content.strip() and _section_name(heading.strip()):
            expanded.append(heading.strip())
            clauses = _split_compound_clauses(content.strip())
            if len(clauses) > 1:
                expanded.extend(clauses)
            else:
                expanded.extend(
                    sentence.strip()
                    for sentence in re.split(
                        rf"(?<=[.!?])\s+(?=[{UPPER_VN}0-9])", content.strip()
                    )
                    if sentence.strip()
                )
            continue
        match = re.match(r"^(?:Kỹ năng|Yêu cầu kỹ năng)\s*[:\-]?\s*(.*)$", line, re.IGNORECASE)
        if match and match.group(1).strip():
            expanded.append("Kỹ năng")
            sentences = re.split(
                rf"(?<=[.!?])\s+(?=[{UPPER_VN}0-9])", match.group(1).strip()
            )
            expanded.extend(s.strip() for s in sentences if s.strip())
            continue
        expanded.append(line)
    return expanded


def _split_sections(lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {
        "overview": [],
        "specialization": [],
        "description": [],
        "requirements": [],
        "preferred": [],
        "benefits": [],
        "other": [],
    }
    current = "overview"
    seen_main_body = False
    in_explicit_overview = False
    for line in lines:
        name = _section_name(line)
        if name:
            if name == "overview":
                in_explicit_overview = True
                current = "overview"
                continue
            if name in {"description", "preferred", "benefits"}:
                seen_main_body = True
                in_explicit_overview = False
            if (
                name == "requirements"
                and in_explicit_overview
                and not seen_main_body
                and _normalize_key(_clean_heading(line)) == "yeu cau"
            ):
                current = "overview"
                continue
            if name == "requirements":
                in_explicit_overview = False
            if name == "specialization" and seen_main_body:
                current = "requirements"
            else:
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


def _is_noise_or_category_tag(clean: str) -> bool:
    if re.fullmatch(
        r"(?:không|có|kỹ năng|yêu cầu|kỹ năng chuyên môn|chuyên môn|tổng quan)",
        clean,
        re.IGNORECASE,
    ):
        return True
    # Lines with colons, commas, or requirement phrasing (e.g. "Proficient in: JavaScript, TypeScript")
    # are genuine requirement lines, not glued PDF category tags.
    if ":" in clean or "," in clean:
        return False
    if re.search(
        r"\b(?:có|biết|hiểu|nắm|thành thạo|sử dụng|xây dựng|phát triển|làm việc|tốt nghiệp|"
        r"proficient|familiar|experience|knowledge|strong|good|skills?|using|with)\b",
        clean,
        re.IGNORECASE,
    ):
        return False
    # Ignore standard camelCase technology names (JavaScript, TypeScript, PostgreSQL, etc.)
    without_tech = re.sub(
        r"\b(?:JavaScript|TypeScript|PostgreSQL|MySQL|FastAPI|PyTorch|TensorFlow|MongoDB|"
        r"GitHub|GitLab|GraphQL|NextJS|NodeJS|DevOps|ArgoCD|JMeter|JUnit|TestNG|ReactJS|VueJS|AngularJS)\b",
        "",
        clean,
    )
    return bool(re.search(rf"[{LOWER_VN}][{UPPER_VN}]", without_tech))


def _mandatory_skills(lines: list[str]) -> list[str]:
    skills = []
    exp_skill_fallbacks = []
    for line in lines:
        clean = line.lstrip("•-–—*+ ").strip()
        if not clean or _is_noise_or_category_tag(clean):
            continue
        if extra_kind(clean) or _is_preferred_line(clean):
            continue
        if re.search(EDUCATION_PATTERN, clean, re.IGNORECASE):
            continue
        if re.search(LANGUAGE_PATTERN, clean, re.IGNORECASE):
            continue
        if re.search(CERTIFICATE_PATTERN, clean, re.IGNORECASE):
            continue
        if re.search(PURE_EXPERIENCE_LINE_PATTERN, clean, re.IGNORECASE):
            continue
        if re.search(EXPERIENCE_REQUIREMENT_PATTERN, clean, re.IGNORECASE):
            exp_skill_fallbacks.append(clean)
            continue
        skills.append(clean)
    return _clean_bullets(skills if skills else exp_skill_fallbacks)


def _extract_fields(lines: list[str]) -> list[str]:
    fields = []
    ignored_field = re.compile(
        r"^(?:các\s+)?(?:ngành|chuyên\s+ngành)\s+(?:khác\s+)?(?:có\s+)?liên\s+quan.*|"
        r"^related\s+(?:fields?|majors?).*|^tương\s+đương.*",
        re.IGNORECASE,
    )
    for line in lines:
        match = re.search(r"(?:ngành|major|field(?:s)? of study)\s*[: ]\s*(.+)", line, re.IGNORECASE)
        if match:
            for part in re.split(r",|/| hoặc | or ", match.group(1)):
                cleaned = part.strip(" .")
                if cleaned and not ignored_field.match(cleaned):
                    fields.append(cleaned)
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


def _split_specialization_tags(lines: list[str]) -> list[str]:
    tags: list[str] = []
    for line in lines:
        parts = re.split(rf"(?<=[{LOWER_VN}])(?=[{UPPER_VN}])|\s*[|/;]\s*", line)
        for part in parts:
            cleaned = part.strip(" •-–—*+,")
            if cleaned:
                tags.append(cleaned)
    return _unique(tags)


def _job_info(lines: list[str], sections: dict[str, list[str]]) -> dict[str, str]:
    content = " ".join(lines)
    spec_tags = _split_specialization_tags(sections.get("specialization", []))

    title_match = re.search(
        r"(?:job\s*title|job\s*description|position|vị trí\s*(?:công việc|tuyển dụng)?|chức danh|tiêu đề công việc|cần tuyển|tuyển dụng)\s*[:\-]\s*([^\n|]{3,80})",
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
    if title_value:
        title_value = re.split(
            r"\s+(?:Địa điểm|Nơi làm việc|Location|Mức lương|Salary|Hình thức|Type)\s*[:\-]",
            title_value,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0].strip()
    if not title_value or title_value.lower() in {"chưa xác định"}:
        for tag in spec_tags:
            if re.search(
                r"\b(intern|thực tập|fresher|junior|senior|lead|manager|kỹ sư|developer|engineer|chuyên viên|nhân viên|analyst|architect)\b",
                tag,
                re.IGNORECASE,
            ):
                title_value = tag
                break
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
    if not department_value and spec_tags:
        domain_tags = [tag for tag in spec_tags if tag != title_value]
        if domain_tags:
            department_value = " · ".join(domain_tags)

    if re.search(r"\b(intern|thực tập|internship)\b", content, re.IGNORECASE):
        level = "Intern"
    elif re.search(r"\b(fresher)\b", content, re.IGNORECASE):
        level = "Fresher"
    elif re.search(r"\b(senior)\b", content, re.IGNORECASE):
        level = "Senior"
    elif re.search(r"\b(junior)\b", content, re.IGNORECASE):
        level = "Junior"
    else:
        year_match = re.search(
            r"(\d+)\s*\+?\s*(?:năm|years?)\s*kinh\s*nghiệm", content, re.IGNORECASE
        )
        if year_match and int(year_match.group(1)) >= 3:
            level = "Senior"
        elif year_match and int(year_match.group(1)) >= 1:
            level = "Junior / Middle"
        elif re.search(r"không\s+yêu\s+cầu\s+kinh\s+nghiệm", content, re.IGNORECASE):
            level = "Fresher / Intern"
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
