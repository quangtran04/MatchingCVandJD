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

