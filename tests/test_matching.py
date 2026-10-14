"""Stage 3 scoring uses synthetic profiles and reproducible dates."""

from datetime import date

from fastapi.testclient import TestClient

from app.application.job_extraction import extract_job_profile
from app.application.matching import match_profiles
from app.application.nlp_text import tfidf_cosine, tokenize
from app.application.profile_extraction import extract_cv_profile
from app.application.skill_matching import match_tier, requirements_from_lines
from app.main import app

AS_OF = date(2026, 10, 10)


def profiles(
    *,
    cv_skills=None,
    required=None,
    preferred=None,
    projects=None,
    experience=None,
    jd_experience=None,
    education=None,
    jd_education=None,
    fields=None,
):
    cv = {
        "skills": cv_skills or [],
        "projects": projects or [],
        "experience": experience or [],
        "education": education or [],
    }
    jd = {
        "requirements": {
            "mandatory_skills": required or [],
            "experience": jd_experience or [],
            "education": jd_education or [],
            "fields_of_study": fields or [],
        },
        "preferred_requirements": preferred or [],
    }
    return cv, jd


def test_three_tiers_and_java_is_not_javascript() -> None:
    assert match_tier("Java", "Java") == ("exact", 1.0)
    assert match_tier("JS", "JavaScript") == ("normalized", 0.95)
    assert match_tier("Relational Database", "PostgreSQL") == ("semantic", 0.8)
    assert match_tier("PostgreSQL", "Relational Database") is None
    assert match_tier("Java", "JavaScript") is None
    assert match_tier("Vector Database", "Qdrant") == ("semantic", 0.8)


def test_ml_tool_names_in_preferred_requirements_are_recognized() -> None:
    cv, jd = profiles(
        cv_skills=["Hugging Face", "PEFT", "Qdrant"],
        preferred=["Có kinh nghiệm với Hugging Face, PEFT, Qdrant hoặc ChromaDB."],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    names = {item["jd_skill"] for item in report["matched_skills"]}
    assert {"Hugging Face", "PEFT", "Qdrant hoặc ChromaDB"} <= names
    assert (
        next(
            item for item in report["matched_skills"] if item["jd_skill"] == "Qdrant hoặc ChromaDB"
        )["jd_option"]
        == "Qdrant"
    )


def test_tokenization_preserves_technical_skills() -> None:
    assert tokenize("C++ C# Xử lý ngôn ngữ") == ["c++", "c#", "xu", "ly", "ngon", "ngu"]
    assert extract_cv_profile("SKILLS\nC#, C++")["skills"] == ["C#", "C++"]


def test_tfidf_cosine_matches_reordered_phrase_without_false_semantics() -> None:
    corpus = ("REST API", "Java", "JavaScript", "Relational Database", "PostgreSQL")
    assert tfidf_cosine("REST API", "API REST", corpus) == 1.0
    assert tfidf_cosine("Relational Database", "PostgreSQL", corpus) == 0.0
    assert match_tier("REST API", "API REST") == ("normalized", 0.9)
    assert match_tier("Machine Learning", "Deep Learning") == ("semantic", 0.8)
    assert match_tier("Data Science", "Data Analytics") is None


def test_match_report_exposes_cosine_and_matching_method() -> None:
    cv, jd = profiles(cv_skills=["API REST"], required=["REST API"])
    report = match_profiles(cv, jd, as_of=AS_OF)
    match = report["matched_skills"][0]
    assert match["match_method"] == "tfidf_cosine"
    assert match["cosine_similarity"] == 1.0
    assert match["jd_evidence"] == "REST API"
    assert match["cv_evidence"] == "API REST"


def test_required_skill_uses_each_cv_skill_only_once_and_prefers_closest() -> None:
    cv, jd = profiles(cv_skills=["PostgreSQL"], required=["Relational Database", "PostgreSQL"])
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert [(item["jd_skill"], item["tier"]) for item in report["matched_skills"]] == [
        ("PostgreSQL", "exact")
    ]
    assert report["missing_required_skills"] == ["Relational Database"]
    assert report["scores"]["skill_match"]["score"] == 50
    assert report["warnings"]


def test_either_or_skill_is_one_requirement() -> None:
    cv, jd = profiles(
        cv_skills=["TensorFlow"],
        required=["Familiar with PyTorch hoặc TensorFlow"],
        projects=[{"title": "Model", "details": "Trained with TensorFlow"}],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["skill_match"]["score"] == 100
    assert report["scores"]["project_relevance"]["score"] == 100
    assert report["missing_required_skills"] == []
    assert report["matched_skills"][0]["jd_option"] == "TensorFlow"


def test_weighted_score_and_traceable_evidence() -> None:
    cv, jd = profiles(
        cv_skills=["JavaScript", "PostgreSQL"],
        required=["JS", "Relational Database"],
        experience=[{"title": "Developer", "details": "2 years experience"}],
        jd_experience=["4 years experience"],
        education=[{"title": "Bachelor of Computer Science", "details": "Graduated"}],
        jd_education=["Bachelor degree in Computer Science"],
        projects=[{"title": "Web app", "details": "Built a JavaScript client"}],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert {key: item["score"] for key, item in report["scores"].items()} == {
        "skill_match": 87.5,
        "experience_match": 50.0,
        "education_match": 100.0,
        "project_relevance": 50.0,
    }
    assert report["base_score"] == 77.3
    assert report["project_bonus_points"] == 5
    assert report["overall_score"] == 82.3
    assert report["skill_match"] == 87.5
    assert report["experience_match"] == 50.0
    assert report["scores"]["experience_match"]["evidence"]["cv_years"] == 2
    assert report["project_matches"][0]["project_evidence"].startswith("Web app")
    assert all(item["jd_evidence"] and item["cv_evidence"] for item in report["matched_skills"])


def test_missing_jd_years_and_education_redistribute_weights() -> None:
    cv, jd = profiles(
        cv_skills=["Python"],
        required=["Python"],
        projects=[{"title": "Demo", "details": "Python service"}],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["experience_match"]["score"] is None
    assert report["scores"]["education_match"]["score"] is None
    assert report["scores"]["skill_match"]["effective_weight"] == 1.0
    assert report["scores"]["project_relevance"]["effective_weight"] == 0
    assert report["project_bonus_points"] == 10
    assert report["project_bonus_applied_points"] == 0
    assert report["overall_score"] == 100


def test_student_requirement_matches_university_enrollment_and_field_alias() -> None:
    cv, jd = profiles(
        education=[
            {
                "title": "University of Example",
                "details": "Major: Information Technology; expected 2027",
            }
        ],
        jd_education=["Sinh viên năm cuối đại học ngành CNTT"],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["education_match"]["score"] == 100
    assert report["scores"]["education_match"]["evidence"]["cv_entries"]
    evidence = report["scores"]["education_match"]["evidence"]
    assert evidence["jd_degree"] == "student"
    assert evidence["cv_degree"] == "student"
    assert evidence["jd_fields"] == ["Information Technology"]
    assert evidence["degree_match"] is True
    assert evidence["field_match"] is True


def test_education_evidence_separates_matched_degree_from_missing_field() -> None:
    cv, jd = profiles(
        education=[{"title": "Bachelor of Information Technology", "details": "Graduated"}],
        jd_education=["Bachelor degree in Computer Science"],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    evidence = report["scores"]["education_match"]["evidence"]
    assert report["scores"]["education_match"]["score"] == 0
    assert evidence["degree_match"] is True
    assert evidence["field_match"] is False
    assert evidence["jd_fields"] == ["Computer Science"]
    assert evidence["cv_fields"] == ["Information Technology"]


def test_required_skills_weigh_twice_as_much_as_preferred() -> None:
    cv, jd = profiles(cv_skills=["Python"], required=["Python"], preferred=["Docker"])
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["skill_match"]["score"] == 66.7
    assert report["missing_required_skills"] == []


def test_projects_are_scored_from_project_section_only() -> None:
    cv, jd = profiles(
        cv_skills=["Python"],
        required=["Python"],
        projects=[{"title": "Docker demo", "details": "Deployed with Docker"}],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["skill_match"]["score"] == 100
    assert report["scores"]["project_relevance"]["score"] == 0
    assert report["overall_score"] == 100
    assert report["project_bonus_points"] == 0


def test_numbered_jd_line_is_never_a_skill() -> None:
    assert requirements_from_lines(["2.", "2. Python"]) == requirements_from_lines(["2. Python"])
    profile = extract_job_profile("Yêu cầu\n2.\nPython")
    assert "2." not in profile["requirements"]["mandatory_skills"]
    cv, _ = profiles(cv_skills=["Python"])
    report = match_profiles(cv, profile, as_of=AS_OF)
    assert report["missing_required_skills"] == []
    assert report["scores"]["skill_match"]["score"] == 100


def test_project_evidence_only_adds_points_and_never_creates_missing_penalty() -> None:
    cv, jd = profiles(
        cv_skills=["Python"],
        required=["Python", "Docker"],
        projects=[{"title": "API", "details": "Built with Python"}],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["base_score"] == 50
    assert report["project_bonus_points"] == 5
    assert report["project_bonus_applied_points"] == 5
    assert report["overall_score"] == 55
    assert report["scores"]["project_relevance"]["base_weight"] == 0


def test_skill_in_project_can_satisfy_core_skill_with_project_evidence() -> None:
    cv, jd = profiles(
        required=["Python", "Docker"],
        projects=[{"title": "API", "details": "Built services with Python"}],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["skill_match"]["score"] == 50
    assert report["matched_skills"][0]["cv_evidence"].startswith("API")
    assert report["project_bonus_points"] == 5


def test_generic_ai_mention_is_not_evidence_of_ai_coding_tools() -> None:
    cv, jd = profiles(
        cv_skills=["Large Language Models"],
        preferred=["Ưu tiên ứng viên đã từng sử dụng các công cụ AI hỗ trợ lập trình."],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["skill_match"]["score"] is None
    assert report["other_requirements"][0]["status"] == "unverified"


def test_other_requirements_show_evidence_without_claiming_personal_traits() -> None:
    cv_text = """SUMMARY
Passionate about AI and seeking a programming career.
SKILLS
Python, GitHub Copilot
PROJECTS
AI Chatbot - Built RAG assistant with Python.
"""
    jd_text = """Mô tả công việc
Xây dựng chatbot RAG với Python.
Yêu cầu
Python
Yêu thích công nghệ, AI và mong muốn phát triển sự nghiệp lập trình.
Có tư duy logic, chủ động học hỏi và tinh thần trách nhiệm cao.
Ưu tiên
Ưu tiên ứng viên đã từng sử dụng các công cụ AI hỗ trợ lập trình.
"""
    cv = extract_cv_profile(cv_text)
    jd = extract_job_profile(jd_text)
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert jd["requirements"]["mandatory_skills"] == ["Python"]
    assert len(report["responsibility_matches"]) == 1
    assert report["responsibility_matches"][0]["status"] == "related"
    signals = {item["jd_text"]: item for item in report["other_requirements"]}
    assert signals["Yêu thích công nghệ, AI"]["status"] == "evidence"
    assert signals["mong muốn phát triển sự nghiệp lập trình"]["status"] == "evidence"
    assert signals["Có tư duy logic"]["status"] == "unverified"
    assert signals["chủ động học hỏi"]["status"] == "unverified"
    assert signals["tinh thần trách nhiệm cao"]["status"] == "unverified"
    assert (
        signals["Ưu tiên ứng viên đã từng sử dụng các công cụ AI hỗ trợ lập trình."]["status"]
        == "evidence"
    )
    assert (
        signals["Ưu tiên ứng viên đã từng sử dụng các công cụ AI hỗ trợ lập trình."]["cv_evidence"]
        == "GitHub Copilot"
    )
    assert report["scores"]["skill_match"]["score"] == 100


def test_overlapping_experience_periods_are_not_double_counted() -> None:
    cv, jd = profiles(
        experience=[
            {"title": "Job A", "date": "2020 - 2022"},
            {"title": "Job B", "date": "2021 - 2023"},
        ],
        jd_experience=["4 years experience"],
    )
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["scores"]["experience_match"]["score"] == 100
    assert report["scores"]["experience_match"]["evidence"]["cv_years"] == 4


def test_no_scorable_jd_criteria_has_no_overall_score() -> None:
    cv, jd = profiles()
    report = match_profiles(cv, jd, as_of=AS_OF)
    assert report["overall_score"] is None
    assert all(item["score"] is None for item in report["scores"].values())


def test_match_endpoint_uses_real_extraction() -> None:
    response = TestClient(app).post(
        "/api/match",
        json={
            "cv_text": "SKILLS\nPython\nPROJECTS\n• API demo\n– Built with Python",
            "jd_text": "Yêu cầu\nPython",
        },
    )
    assert response.status_code == 200
    report = response.json()
    assert report["scores"]["skill_match"]["score"] == 100
    assert report["matched_skills"][0]["jd_skill"] == "Python"
    assert report["scores"]["project_relevance"]["score"] == 100


def test_match_endpoint_rejects_empty_input() -> None:
    response = TestClient(app).post("/api/match", json={"cv_text": "", "jd_text": "Python"})
    assert response.status_code == 422
