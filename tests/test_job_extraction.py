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

