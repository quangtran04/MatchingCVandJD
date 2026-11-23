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


def test_extracts_diverse_layouts_markdown_ascii_box_and_date_first() -> None:
    ascii_box_cv = """+------------------------------------------------------------+
| NGUYỄN THỊ MAI                                             |
| Backend Developer (Java)                                   |
+------------------------------------------------------------+
  nguyen.thi.mai@example.com  /  0991 000 495  /  Đà Nẵng

[ CÔNG NGHỆ / TECH STACK ]
    Java  ·  Spring Boot  ·  Docker  ·  REST API

[ KINH NGHIỆM / EMPLOYMENT HISTORY ]
> Backend Developer @ Công ty ABC (02/2024 - Hiện tại / Present)
    • Xây dựng RESTful API với Spring Boot

[ DỰ ÁN NỔI BẬT ]
 * Hệ thống quản lý kho hàng
"""
    p1 = extract_cv_profile(ascii_box_cv)
    assert p1["personal_info"]["name"] == "NGUYỄN THỊ MAI"
    assert p1["personal_info"]["email"] == "nguyen.thi.mai@example.com"
    assert p1["personal_info"]["location"] == "Đà Nẵng"
    assert p1["skills"] == ["Java", "Spring Boot", "Docker", "REST API"]
    assert len(p1["experience"]) == 1
    assert p1["experience"][0]["date"] == "02/2024 - Hiện tại / Present"
    assert len(p1["projects"]) == 1

    markdown_cv = """# Ngô Thành Hùng
**Vị trí ứng tuyển:** Backend Developer
ngo.hung@example.com | 0979 000 740 | Hải Phòng

## Kinh nghiệm
### Backend Developer — Công ty Bắc Hà
*07/2024 - Hiện tại / Present*
- Đóng gói dịch vụ bằng Docker

## Công nghệ / Tech stack
- AWS · MySQL · Spring Boot
"""
    p2 = extract_cv_profile(markdown_cv)
    assert p2["personal_info"]["name"] == "Ngô Thành Hùng"
    assert p2["skills"] == ["AWS", "MySQL", "Spring Boot"]
    assert len(p2["experience"]) == 1
    assert p2["experience"][0]["title"] == "Backend Developer — Công ty Bắc Hà"
    assert p2["experience"][0]["date"] == "07/2024 - Hiện tại / Present"

    date_first_cv = """Phan Ngoc Linh
Backend Developer
phan.linh@example.com | 0917 000 577 | Hai Phong

WORK EXPERIENCE
01/2023 - Present
Senior Backend Developer
Công ty Sao Việt
• Designed RESTful APIs
05/2018 - 07/2020
Java Developer
Công ty Bắc Hà
• Wrote unit tests
"""
    p3 = extract_cv_profile(date_first_cv)
    assert len(p3["experience"]) == 2
    assert p3["experience"][0]["date"] == "01/2023 - Present"
    assert "Senior Backend Developer" in p3["experience"][0]["title"]
    assert p3["experience"][1]["date"] == "05/2018 - 07/2020"


def test_merges_wrapped_bilingual_education_entry() -> None:
    cv = """NGUYỄN VĂN A
HỌC VẤN / EDUCATION
Kỹ sư Công nghệ thông tin / B.Eng. in Information Technology, Đại học Bách khoa Hà Nội / Hanoi
University of Science and Technology (2020 - 2024)
"""
    prof = extract_cv_profile(cv)
    assert len(prof["education"]) == 1
    assert "Hanoi University of Science and Technology" in prof["education"][0]["title"]
    assert prof["education"][0]["date"] == "2020 - 2024"


