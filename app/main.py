"""FastAPI entry point for document, extraction, single-match, and batch-ranking endpoints."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.application.baselines import (
    score_keyword_baseline,
    score_sbert_batch,
    score_tfidf_fulltext_batch,
)
from app.application.job_extraction import extract_job_profile
from app.application.matching import MatchConfig, match_profiles
from app.application.profile_extraction import extract_cv_profile
from app.application.skill_matching import taxonomy
from app.application.text_extraction import TextExtractionError, extract_text
from app.application.translation import translate_texts

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
DATASET_DIR = Path(__file__).resolve().parents[1] / "CV_JD_Dataset"


class InformationExtractionRequest(BaseModel):
    cv_text: str
    jd_text: str


class MatchConfigPayload(BaseModel):
    enable_semantic: bool = True
    enable_one_to_one: bool = True
    enable_job_fit: bool = True
    enable_dynamic_weights: bool = True
    enable_project_bonus: bool = True
    weights: dict[str, float] | None = None


class BatchCandidateInput(BaseModel):
    id: str = ""
    filename: str = ""
    cv_text: str
    language: str = ""


class BatchMatchRequest(BaseModel):
    jd_text: str
    candidates: list[BatchCandidateInput] = Field(min_length=1, max_length=100)
    config: MatchConfigPayload | None = None
    include_baselines: bool = True
    include_sbert: bool = False


class TranslateTextsRequest(BaseModel):
    target_lang: str = Field(pattern="^(vi|en)$")
    texts: list[str] = Field(default_factory=list, max_length=500)


def _to_match_config(payload: MatchConfigPayload | None) -> MatchConfig:
    if payload is None:
        return MatchConfig()
    clean_weights: dict[str, float] | None = None
    if payload.weights:
        allowed = {"job_fit", "skill_match", "experience_match", "education_match"}
        raw = {k: max(0.0, float(v)) for k, v in payload.weights.items() if k in allowed}
        total = sum(raw.values())
        if total > 0:
            clean_weights = {k: v / total for k, v in raw.items()}
    return MatchConfig(
        enable_semantic=payload.enable_semantic,
        enable_one_to_one=payload.enable_one_to_one,
        enable_job_fit=payload.enable_job_fit,
        enable_dynamic_weights=payload.enable_dynamic_weights,
        enable_project_bonus=payload.enable_project_bonus,
        weights=clean_weights,
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="CV–JD Matching API",
        version="0.2.0",
        description="Extract structured CV/JD data and return explainable single and batch CV-to-JD rankings.",
    )

    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/", include_in_schema=False)
    async def landing_page():
        from fastapi.responses import FileResponse

        return FileResponse(static_dir / "index.html")

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/translate-texts", tags=["translation"])
    async def translate_texts_endpoint(request: TranslateTextsRequest) -> dict[str, Any]:
        """Translate extracted CV/JD/report text snippets to 'vi' or 'en' with caching."""
        translations = translate_texts(request.texts, request.target_lang)
        return {"target_lang": request.target_lang, "translations": translations}

    @app.post("/api/extract-text", tags=["extraction"])
    async def extract_uploaded_text(file: UploadFile = File(...)) -> dict[str, str]:  # noqa: B008
        """Extract raw text from a document without persisting its content."""
        payload = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(payload) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"code": "FILE_TOO_LARGE", "message": "Tệp không được lớn hơn 10MB."},
            )
        try:
            text, method = extract_text(payload, file.filename or "")
        except TextExtractionError as error:
            raise HTTPException(
                status_code=error.status_code,
                detail={"code": error.code, "message": error.message},
            ) from error
        return {"filename": file.filename or "", "text": text, "method": method}

    @app.post("/api/extract-information", tags=["extraction"])
    async def extract_information(request: InformationExtractionRequest) -> dict[str, object]:
        """Extract structured CV and JD profiles from raw texts."""
        if not request.cv_text.strip() or not request.jd_text.strip():
            raise HTTPException(
                status_code=422,
                detail={"code": "MISSING_INPUT", "message": "CV và JD đều phải có văn bản."},
            )
        return {
            "cv_profile": extract_cv_profile(request.cv_text),
            "jd_profile": extract_job_profile(request.jd_text),
        }

    @app.post("/api/match", tags=["matching"])
    async def match_information(request: InformationExtractionRequest) -> dict[str, object]:
        """Extract both profiles and return an evidence-backed matching report."""
        if not request.cv_text.strip() or not request.jd_text.strip():
            raise HTTPException(
                status_code=422,
                detail={"code": "MISSING_INPUT", "message": "CV và JD đều phải có văn bản."},
            )
        cv_profile = extract_cv_profile(request.cv_text)
        jd_profile = extract_job_profile(request.jd_text)
        return match_profiles(cv_profile, jd_profile)

    @app.post("/api/match-batch", tags=["matching"])
    async def match_batch(request: BatchMatchRequest) -> dict[str, Any]:
        """Compare one JD against multiple CVs, rank candidates, and optionally compute baselines."""
        if not request.jd_text.strip():
            raise HTTPException(
                status_code=422,
                detail={"code": "MISSING_JD", "message": "Cần nhập nội dung Mô tả công việc (JD)."},
            )
        valid_candidates = [c for c in request.candidates if c.cv_text.strip()]
        if not valid_candidates:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "MISSING_CVS",
                    "message": "Cần ít nhất một hồ sơ ứng viên có nội dung văn bản.",
                },
            )

        cfg = _to_match_config(request.config)
        jd_profile = extract_job_profile(request.jd_text)
        cv_texts = [c.cv_text for c in valid_candidates]

        tfidf_scores: list[float] | None = None
        sbert_scores: list[float] | None = None
        if request.include_baselines:
            tfidf_scores = score_tfidf_fulltext_batch(request.jd_text, cv_texts)
            if request.include_sbert:
                try:
                    sbert_scores = score_sbert_batch(request.jd_text, cv_texts)
                except Exception:
                    sbert_scores = None

        rows: list[dict[str, Any]] = []
        for idx, cand in enumerate(valid_candidates):
            cv_profile = extract_cv_profile(cand.cv_text)
            report = match_profiles(cv_profile, jd_profile, config=cfg)
            info = cv_profile.get("personal_info") or {}
            cand_name = str(info.get("name") or cand.filename or f"Ứng viên {idx + 1}").strip()
            headline = str(info.get("headline") or "").strip()
            lang = cand.language
            if not lang and cand.filename:
                lm = re.search(r"_(vi|en|bi)\.", cand.filename, re.IGNORECASE)
                lang = lm.group(1).lower() if lm else ""

            skill_ev = report["scores"]["skill_match"]["evidence"]
            req_total = len(skill_ev.get("required") or [])
            pref_total = len(skill_ev.get("preferred") or [])
            rows.append(
                {
                    "id": cand.id or f"cv-{idx + 1}",
                    "filename": cand.filename or f"Ứng viên #{idx + 1}",
                    "language": lang,
                    "candidate_name": cand_name,
                    "headline": headline,
                    "overall_score": report["overall_score"],
                    "base_score": report["base_score"],
                    "project_bonus_applied_points": report["project_bonus_applied_points"],
                    "job_fit": report["job_fit"],
                    "skill_match": report["skill_match"],
                    "experience_match": report["experience_match"],
                    "education_match": report["education_match"],
                    "matched_skills_count": len(report["matched_skills"]),
                    "total_jd_skills": req_total + pref_total,
                    "missing_required_skills": report["missing_required_skills"],
                    "baseline_keyword": (
                        score_keyword_baseline(cand.cv_text, jd_profile)
                        if request.include_baselines
                        else None
                    ),
                    "baseline_tfidf": tfidf_scores[idx] if tfidf_scores is not None else None,
                    "baseline_sbert": sbert_scores[idx] if sbert_scores is not None else None,
                    "cv_profile": cv_profile,
                    "report": report,
                }
            )

        rows.sort(
            key=lambda item: (
                item["overall_score"] if item["overall_score"] is not None else -1.0,
                item["skill_match"] if item["skill_match"] is not None else -1.0,
                item["job_fit"] if item["job_fit"] is not None else -1.0,
                item["experience_match"] if item["experience_match"] is not None else -1.0,
            ),
            reverse=True,
        )
        for rank_idx, row in enumerate(rows, start=1):
            row["rank"] = rank_idx

        valid_scores = [r["overall_score"] for r in rows if r["overall_score"] is not None]
        sorted_vals = sorted(valid_scores)
        median = (
            round(sorted_vals[len(sorted_vals) // 2], 1)
            if len(sorted_vals) % 2 == 1
            else round((sorted_vals[len(sorted_vals) // 2 - 1] + sorted_vals[len(sorted_vals) // 2]) / 2, 1)
            if sorted_vals
            else None
        )
        return {
            "taxonomy_version": taxonomy()["version"],
            "jd_profile": jd_profile,
            "total_candidates": len(rows),
            "sbert_included": sbert_scores is not None,
            "summary_stats": {
                "top_score": max(valid_scores) if valid_scores else None,
                "avg_score": round(sum(valid_scores) / len(valid_scores), 1) if valid_scores else None,
                "median_score": median,
                "qualified_count": sum(1 for s in valid_scores if s >= 70.0),
            },
            "rankings": rows,
        }

    @app.get("/api/dataset-presets", tags=["dataset"])
    async def list_dataset_presets() -> dict[str, Any]:
        """List available evaluation dataset folders in CV_JD_Dataset for quick demo ranking."""
        if not DATASET_DIR.exists():
            return {"presets": []}
        presets = []
        for jd_dir in sorted(d for d in DATASET_DIR.iterdir() if d.is_dir()):
            jd_files = [f for f in jd_dir.iterdir() if f.is_file()]
            cv_dir = jd_dir / "CVs"
            cv_files = sorted(f for f in cv_dir.iterdir() if f.is_file()) if cv_dir.exists() else []
            if jd_files and cv_files:
                presets.append(
                    {
                        "id": jd_dir.name,
                        "label": jd_dir.name.replace("_", " "),
                        "jd_filename": jd_files[0].name,
                        "cv_count": len(cv_files),
                    }
                )
        return {"presets": presets}

    @app.post("/api/dataset-presets/{preset_id}", tags=["dataset"])
    async def load_dataset_preset(preset_id: str) -> dict[str, Any]:
        """Extract JD and all CVs from a preset folder in CV_JD_Dataset."""
        if not re.fullmatch(r"[A-Za-z0-9_\-]+", preset_id):
            raise HTTPException(status_code=400, detail={"message": "Mã bộ dữ liệu không hợp lệ."})
        jd_dir = DATASET_DIR / preset_id
        if not jd_dir.is_dir():
            raise HTTPException(status_code=404, detail={"message": "Không tìm thấy bộ dữ liệu mẫu."})
        jd_files = [f for f in jd_dir.iterdir() if f.is_file()]
        cv_dir = jd_dir / "CVs"
        if not jd_files or not cv_dir.is_dir():
            raise HTTPException(status_code=404, detail={"message": "Bộ dữ liệu không đủ tệp JD/CV."})

        jd_text, _ = extract_text(jd_files[0].read_bytes(), jd_files[0].name)
        candidates = []
        for idx, cv_file in enumerate(sorted(f for f in cv_dir.iterdir() if f.is_file()), start=1):
            try:
                cv_text, _ = extract_text(cv_file.read_bytes(), cv_file.name)
            except TextExtractionError:
                continue
            lm = re.search(r"_(vi|en|bi)\.", cv_file.name, re.IGNORECASE)
            candidates.append(
                {
                    "id": f"{preset_id}-cv-{idx}",
                    "filename": cv_file.name,
                    "language": lm.group(1).lower() if lm else "",
                    "cv_text": cv_text,
                }
            )
        return {
            "id": preset_id,
            "jd_filename": jd_files[0].name,
            "jd_text": jd_text,
            "candidates": candidates,
        }

    return app


app = create_app()
