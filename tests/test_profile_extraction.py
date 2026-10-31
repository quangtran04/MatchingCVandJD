from pathlib import Path

from app.application.profile_extraction import extract_cv_profile


def test_extracts_fields_from_sample_cv() -> None:
    text = (Path(__file__).parent / "textcv.txt").read_text(encoding="utf-8")
    profile = extract_cv_profile(text)

    assert profile["personal_info"]["name"] == "TRAN ANH QUANG"
    assert profile["personal_info"]["email"] == "taquangk63@gmail.com"
    assert profile["personal_info"]["location"] == "Ha Noi City, Viet Nam"
    assert "Python" in profile["skills"]
    assert "PostgreSQL" in profile["skills"]
    assert "Large Language Models (LLMs)" in profile["skills"]
    assert profile["experience"][0]["title"] == "AI Intern — iVista Technology"
    assert profile["education"][0]["title"] == "University of Transport and Communications (UTC)"
    assert profile["projects"][0]["title"] == "Bee Assistant - AI Chatbot"
    assert profile["certificates"] == []


def test_extracts_vietnamese_cv_with_missing_heading_spaces_and_wrapped_skills() -> None:
    text = """NGUYỄN ĐỖTHANH TÙNG
THỰC TẬP SINH AI
Ó +84 918 345 885 ⋄½ Hà Nội, Việt Nam ⋄R trunbnguyen@gmail.com
GIỚI THIỆU
Tôi là sinh viên năm cuối ngành Công nghệ Thông tin.
HỌC VẤN
Trường Đại học Giao thông Vận tải (UTC)
09/2022 – 06/2027 (Dự kiến)
Chuyên ngành: Công nghệ Thông tin
• GPA: 3.10/4.00
KỸNĂNG
Kỹnăng chuyên môn
• Ngôn ngữ lập trình: Python, Java, C/C++
• Machine Learning: Học có giám sát, Phân loại, Hồi quy, Đánh giá
mô hình, Tối ưu siêu tham số
• NLP & RAG: Text Embeddings, Vector Databases, Retrieval-
Augmented Generation (RAG), Prompt Engineering, Truy xuất tài
liệu
Ngoại ngữ
• Tiếng Anh: B2
• Đọc hiểu tài liệu kỹ thuật
DỰÁN
• Hệ thống nhận diện ngôn ngữ ký hiệu thời gian thực | Số thành viên: 1 | Vai trò: AI Developer
2026
– Mô tả: Xây dựng hệ thống nhận diện ngôn ngữ ký hiệu theo thời gian thực.
• Hệ thống hỏi đáp tài liệu sử dụng RAG | Số thành viên: 1 | Vai trò: AI Developer
2026
– Mô tả: Phát triển hệ thống hỏi đáp tài liệu ứng dụng RAG.
"""
    profile = extract_cv_profile(text)

    assert "KỸNĂNG" not in profile["education"][0]["details"]
    assert "Machine Learning" in profile["skills"]
    assert "Đánh giá mô hình" in profile["skills"]
    assert "Retrieval-Augmented Generation (RAG)" in profile["skills"]
    assert "Truy xuất tài liệu" in profile["skills"]
    assert profile["languages"] == ["Tiếng Anh: B2", "Đọc hiểu tài liệu kỹ thuật"]
    assert len(profile["projects"]) == 2
    assert profile["projects"][0]["date"] == "2026"
    assert "Hệ thống hỏi đáp tài liệu sử dụng RAG" in profile["projects"][1]["title"]
