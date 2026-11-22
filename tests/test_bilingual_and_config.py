"""Unit tests for bilingual parsing, Vietnamese compounds, MatchConfig ablations, and baselines."""

from datetime import date

from app.application.baselines import score_keyword_baseline, score_tfidf_fulltext_batch
from app.application.job_extraction import extract_job_profile
from app.application.matching import MatchConfig, match_profiles
from app.application.nlp_text import segment_vietnamese_compounds, tokenize
from app.application.profile_extraction import extract_cv_profile
from app.application.skill_matching import match_tier

AS_OF = date(2026, 11, 22)


def test_bilingual_cv_headings_and_pipe_experience_are_extracted() -> None:
    cv_text = """ĐẶNG PHƯƠNG LAN
Vị trí ứng tuyển / Applying for: Backend Developer (Java)
Liên hệ / Contact: lan@example.com | 0964 000 291 | Hà Nội / Hanoi
MỤC TIÊU NGHỀ NGHIỆP / CAREER OBJECTIVE
2 năm kinh nghiệm lập trình Java.
KINH NGHIỆM LÀM VIỆC / WORK EXPERIENCE
Java Developer | Công ty Bắc Hà
08/2024 - Hiện tại / Present
• Designed and developed RESTful APIs with Java and Spring Boot.
HỌC VẤN / EDUCATION
Kỹ sư Công nghệ thông tin / B.Eng. in Information Technology, ĐH Bách khoa Hà Nội (2020 - 2024)
KỸ NĂNG / SKILLS
Java, Spring Boot, MySQL, REST API, Docker, Git
NGOẠI NGỮ / LANGUAGES
Tiếng Anh / English: IELTS 7.0
"""
    profile = extract_cv_profile(cv_text)
    assert profile["personal_info"]["email"] == "lan@example.com"
    assert "Spring Boot" in profile["skills"]
    assert len(profile["experience"]) == 1
    assert profile["experience"][0]["date"] == "08/2024 - Hiện tại / Present"
    assert len(profile["education"]) == 1
    assert len(profile["languages"]) == 1


def test_english_b_eng_degree_and_frontend_camelcase_jd_skills() -> None:
    jd_text = """JOB DESCRIPTION: FRONTEND DEVELOPER (REACT)
RESPONSIBILITIES
- Develop web interfaces with React and TypeScript
REQUIREMENTS
- At least 2 years of experience in a similar role
- Proficient in: JavaScript, TypeScript, React, HTML/CSS, REST API, Git
- Bachelor's degree in a relevant field
NICE TO HAVE
- Experience with: Next.js, Redux, Jest, Tailwind CSS, Webpack
"""
    cv_text = """NGUYEN VAN A
EXPERIENCE
Frontend Engineer | Tech Corp
01/2023 - Present
- Built web interfaces using React, TypeScript, and REST APIs.
EDUCATION
B.Eng. in Information Technology, National Economics University (2018 - 2022)
SKILLS
JavaScript, TypeScript, React, HTML/CSS, REST API, Git, Redux
"""
    jd = extract_job_profile(jd_text)
    cv = extract_cv_profile(cv_text)
    assert any("JavaScript" in line for line in jd["requirements"]["mandatory_skills"])
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["education_match"] == 100.0
    assert report["skill_match"] is not None and report["skill_match"] > 70.0
    assert report["job_fit"] is not None and report["job_fit"] >= 80.0


def test_vietnamese_compound_word_segmentation() -> None:
    tokens = tokenize("Tối ưu hiệu năng cơ sở dữ liệu và kiểm thử tự động")
    segmented = segment_vietnamese_compounds(tokens)
    assert "toi_uu" in segmented
    assert "hieu_nang" in segmented
    assert "co_so_du_lieu" in segmented
    assert "kiem_thu_tu_dong" in segmented


def test_match_config_ablation_flags() -> None:
    cv = {
        "skills": ["PostgreSQL"],
        "experience": [{"title": "Dev", "details": "Built backend with PostgreSQL"}],
        "education": [],
        "projects": [{"title": "DB App", "details": "Used PostgreSQL"}],
    }
    jd = {
        "job_description": {"responsibilities": ["Build services with Relational Database."]},
        "requirements": {
            "mandatory_skills": ["Relational Database", "PostgreSQL"],
            "experience": [],
            "education": [],
            "fields_of_study": [],
        },
        "preferred_requirements": [],
    }
    full = match_profiles(cv, jd, as_of=AS_OF)
    no_sem = match_profiles(cv, jd, as_of=AS_OF, config=MatchConfig(enable_semantic=False))
    no_1to1 = match_profiles(cv, jd, as_of=AS_OF, config=MatchConfig(enable_one_to_one=False))
    no_job = match_profiles(cv, jd, as_of=AS_OF, config=MatchConfig(enable_job_fit=False))
    no_dyn = match_profiles(cv, jd, as_of=AS_OF, config=MatchConfig(enable_dynamic_weights=False))

    assert match_tier("Relational Database", "PostgreSQL", enable_semantic=False) is None
    assert no_1to1["skill_match"] > full["skill_match"]
    assert no_job["job_fit"] is None
    assert no_dyn["base_score"] < full["base_score"]
    assert no_sem["skill_match"] == 50.0


def test_keyword_and_tfidf_baselines_rank_relevant_cv_higher() -> None:
    jd_text = "REQUIREMENTS\n- Proficient in: Python, Docker, FastAPI"
    jd = extract_job_profile(jd_text)
    strong_cv = "SKILLS\nPython, Docker, FastAPI\nEXPERIENCE\nBuilt FastAPI services with Docker."
    weak_cv = "SKILLS\nWordPress, PHP\nEXPERIENCE\nMaintained WordPress websites."
    assert score_keyword_baseline(strong_cv, jd) > score_keyword_baseline(weak_cv, jd)
    tfidf_scores = score_tfidf_fulltext_batch(jd_text, [strong_cv, weak_cv])
    assert tfidf_scores[0] > tfidf_scores[1]
