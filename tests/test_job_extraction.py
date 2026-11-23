from pathlib import Path

from app.application.job_extraction import extract_job_profile


def test_extracts_fields_from_sample_jd() -> None:
    text = (Path(__file__).parent / "testjd.txt").read_text(encoding="utf-8")
    profile = extract_job_profile(text)

    assert profile["job_info"]["level"] == "Intern"
    assert "Python" in profile["requirements"]["technologies_tools"]
    assert "PyTorch" in profile["requirements"]["technologies_tools"]
    assert profile["requirements"]["languages"]
    assert profile["preferred_requirements"]


def test_extracts_candidate_requirements_distinct_from_description() -> None:
    sample = """
Mô tả công việc
Về vai trò: Bạn sẽ cùng team xây dựng các tính năng AI thật cho sản phẩm: chatbot RAG, AI agent.
Công việc hằng ngày: Xử lý & chuẩn bị dữ liệu (parsing, embedding, vector search), gọi và tích hợp LLM API
Yêu cầu ứng viên
Yêu cầu kinh nghiệm: 1+ năm kinh nghiệm
Kỹ năng
Thành thạo cơ bản Python, hiểu API, database.
Nắm nền tảng ML/LLM: hiểu cách LLM hoạt động.
Đọc hiểu tài liệu kỹ thuật tiếng Anh, chủ động tự học.
"""
    profile = extract_job_profile(sample)

    assert "Yêu cầu ứng viên" not in profile["job_description"]["description"]
    assert "1+ năm kinh nghiệm" in profile["requirements"]["experience"][0]
    assert len(profile["requirements"]["mandatory_skills"]) >= 2
    assert "Python" in profile["requirements"]["technologies_tools"]
    assert len(profile["requirements"]["languages"]) > 0


def test_excludes_numbered_subsection_headings_from_skill_and_preferred_lists() -> None:
    sample = """
Yêu cầu ứng viên
1. Kiến thức nền tảng
- Có kiến thức cơ bản về Python, Machine Learning/Deep Learning, Transformer và LLM.
- Hiểu nguyên lý hoạt động của RAG, Embedding, Vector Database và các phương pháp Fine-tuning LLM cơ bản.
2. Điểm cộng
- Đã từng thực hiện project cá nhân liên quan đến RAG hoặc Fine-tuning LLM.
3. Tư duy và khả năng làm việc
- Có tư duy phân tích, giải quyết vấn đề và khả năng tự học, nghiên cứu công nghệ mới.
"""
    profile = extract_job_profile(sample)

    assert "1. Kiến thức nền tảng" not in profile["requirements"]["mandatory_skills"]
    assert len(profile["requirements"]["mandatory_skills"]) == 2
    assert "3. Tư duy và khả năng làm việc" not in profile["preferred_requirements"]
    assert len(profile["preferred_requirements"]) == 2


def test_separates_overview_metadata_and_inline_preferred_from_mandatory_skills() -> None:
    sample = """
Tổng quan
Yêu cầu:Không yêu cầu kinh nghiệm chuyên môn,Đại Học trở lên
Tiếng Anh Đọc hiểu
Chuyên môn:
AI EngineerIT - Phần mềmCông nghệ kỹ thuật
Mô tả công việc
Sử dụng Antigravity/AI Agent để phân tích yêu cầu, triển khai và hoàn thiện công việc.
Yêu cầu ứng viên
Bắt buộc thành thạo Antigravity, đã trực tiếp sử dụng trong học tập, dự án cá nhân hoặc công việc.
Biết giao việc cho AI Agent bằng prompt rõ ràng.
Chủ động, học nhanh và có khả năng thích nghi với nhiều loại công việc.
Có khả năng đọc hiểu tài liệu kỹ thuật tiếng Anh cơ bản là một lợi thế.
Ưu tiên ứng viên có thêm kiến thức về: Git/GitHub, Python, Docker, AI Agent. IoT/Robot là lợi thế nhưng không bắt buộc.
Không yêu cầu phải giỏi sẵn tất cả các công nghệ. Công ty đánh giá cao khả năng tự học, thích nghi và biết sử dụng AI để mở rộng năng lực làm việc.
"""
    profile = extract_job_profile(sample)
    reqs = profile["requirements"]

    assert profile["job_info"]["title"] == "AI Engineer"
    assert profile["job_info"]["department"] == "IT - Phần mềm · Công nghệ kỹ thuật"
    assert "Không" not in reqs["mandatory_skills"]
    assert "yêu cầu kinh nghiệm chuyên môn,Đại Học trở lên" not in reqs["mandatory_skills"]
    assert "AI EngineerIT - Phần mềmCông nghệ kỹ thuật" not in reqs["mandatory_skills"]
    assert reqs["mandatory_skills"] == [
        "Bắt buộc thành thạo Antigravity, đã trực tiếp sử dụng trong học tập, dự án cá nhân hoặc công việc.",
        "Biết giao việc cho AI Agent bằng prompt rõ ràng.",
    ]
    assert reqs["experience"] == []
    assert reqs["education"] == ["Đại Học trở lên"]
    assert reqs["languages"] == [
        "Có khả năng đọc hiểu tài liệu kỹ thuật tiếng Anh cơ bản là một lợi thế."
    ]
    assert len(profile["preferred_requirements"]) == 2
    assert len(reqs["other_requirements"]) == 2


def test_routes_co_kinh_nghiem_lines_to_experience_instead_of_mandatory_skills() -> None:
    sample = """
Yêu cầu ứng viên
Có từ 2 năm kinh nghiệm AI, ưu tiên các ứng dụng sử dụng LLM (Large Language Model).
Có kinh nghiệm thực tế trong việc tích hợp mô hình AI hoặc LLM vào ứng dụng.
Có kinh nghiệm xây dựng cơ chế đánh giá, logging, tracing và giám sát các luồng xử lý AI.
Có kinh nghiệm làm việc với PostgreSQL hoặc các hệ quản trị cơ sở dữ liệu quan hệ.
Có hiểu biết về phân quyền dữ liệu, bảo vệ thông tin nhạy cảm và bảo mật ứng dụng AI.
Có kiến thức tốt về: RESTful API; Thiết kế và tích hợp hệ thống; Git.
"""
    profile = extract_job_profile(sample)
    reqs = profile["requirements"]

    assert len(reqs["experience"]) == 4
    assert len(reqs["mandatory_skills"]) == 2
    assert all("Có kinh nghiệm" not in item for item in reqs["mandatory_skills"])


def test_extracts_clean_full_location_without_trailing_sections() -> None:
    inline_jd = """
Vị trí: Backend Developer
Địa điểm: Hà Nội | Mức lương: 20 - 35 triệu VND | Hình thức: Toàn thời gian
Mô tả công việc
- Xây dựng RESTful API bằng Python và FastAPI.
"""
    assert extract_job_profile(inline_jd)["job_info"]["location"] == "Hà Nội"

    multiline_jd = """
Mô tả công việc
- Phát triển ứng dụng AI.
Địa điểm làm việc (đã được cập nhật theo Danh mục Hành chính mới)
- Đà Nẵng: 38 Dương Thị Xuân Quý, Phường Ngũ Hành Sơn (Phường Ngũ Hành Sơn thuộc quận Ngũ Hành Sơn cũ)
Thời gian làm việc
Thứ 2 - Thứ 6 (08:00 - 17:00)
"""
    assert (
        extract_job_profile(multiline_jd)["job_info"]["location"]
        == "Đà Nẵng: 38 Dương Thị Xuân Quý, Phường Ngũ Hành Sơn (Phường Ngũ Hành Sơn thuộc quận Ngũ Hành Sơn cũ)"
    )

    street_jd = """
Địa chỉ: Số 10 Lương Thế Vinh, Nam Từ Liêm, Hà Nội
Mức lương: 15 - 20 triệu
"""
    assert (
        extract_job_profile(street_jd)["job_info"]["location"]
        == "Số 10 Lương Thế Vinh, Nam Từ Liêm, Hà Nội"
    )


def test_extracts_exact_department_or_khong_co() -> None:
    explicit_jd = """
Position: Frontend Developer
Department: Digital Banking Platform | Location: Hanoi
Responsibilities
- Collaborate with Backend, Design and QA teams in Agile.
"""
    assert extract_job_profile(explicit_jd)["job_info"]["department"] == "Digital Banking Platform"

    no_dept_jd = """
Position: Frontend Developer
Location: Ho Chi Minh City | Type: Full-time
Responsibilities
- Collaborate with Backend, Design and QA teams in Agile.
"""
    assert extract_job_profile(no_dept_jd)["job_info"]["department"] == "Không có"


def test_role_overview_excludes_metadata_and_falls_back_to_job_title() -> None:
    meta_only_jd = """
FRONTEND DEVELOPER (REACT)
Location: Ho Chi Minh City | Salary: VND 15 - 30 million | Type: Full-time
RESPONSIBILITIES
- Develop web interfaces with React and TypeScript.
- Integrate REST APIs and optimize performance.
"""
    profile = extract_job_profile(meta_only_jd)
    assert profile["job_description"]["description"] == "FRONTEND DEVELOPER (REACT)"

    with_overview_jd = """
Mô tả công việc
Chúng tôi đang xây dựng nền tảng thương mại điện tử ứng dụng AI cho doanh nghiệp vừa và nhỏ.
Computer Vision:
- Xây dựng mô hình nhận diện hình ảnh.
"""
    profile2 = extract_job_profile(with_overview_jd)
    assert profile2["job_description"]["description"] == (
        "Chúng tôi đang xây dựng nền tảng thương mại điện tử ứng dụng AI cho doanh nghiệp vừa và nhỏ."
    )
    assert "Computer Vision:" not in profile2["job_description"]["description"]


def test_ignores_generic_field_of_study_placeholders() -> None:
    jd = """
Yêu cầu ứng viên
- Tốt nghiệp Đại học chuyên ngành phù hợp
- Bachelor's degree in a relevant field
"""
    assert extract_job_profile(jd)["requirements"]["fields_of_study"] == []


def test_deduplicates_bilingual_education_requirements() -> None:
    jd = """
Yêu cầu ứng viên
- Tốt nghiệp Đại học chuyên ngành phù hợp
- Bachelor's degree in a relevant field
"""
    assert extract_job_profile(jd)["requirements"]["education"] == [
        "Tốt nghiệp Đại học chuyên ngành phù hợp"
    ]






