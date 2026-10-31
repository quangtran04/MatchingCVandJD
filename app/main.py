"""FastAPI entry point for document, extraction, and matching endpoints."""

from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.application.document_validation import (
    InvalidDocumentError,
    ensure_cv,
    ensure_jd,
    ensure_pair,
)
from app.application.job_extraction import extract_job_profile
from app.application.matching import match_profiles
from app.application.profile_extraction import extract_cv_profile
from app.application.text_extraction import TextExtractionError, extract_text

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class InformationExtractionRequest(BaseModel):
    cv_text: str
    jd_text: str


class DocumentValidationRequest(BaseModel):
    kind: Literal["cv", "jd"]
    text: str


def _invalid_document_http_error(error: InvalidDocumentError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "code": "INVALID_DOCUMENT",
            "message": " ".join(f"{r.expected.upper()}: {r.message}" for r in error.results),
            "errors": [
                {
                    "field": r.expected,
                    "detected": r.detected,
                    "message": r.message,
                    "cv_score": r.cv_score,
                    "jd_score": r.jd_score,
                }
                for r in error.results
            ],
        },
    )


def _validate_request(request: InformationExtractionRequest) -> None:
    """Chặn văn bản không phải CV/JD (hoặc dán nhầm ô) trước khi trích xuất."""
    if not request.cv_text.strip() or not request.jd_text.strip():
        raise HTTPException(
            status_code=422,
            detail={"code": "MISSING_INPUT", "message": "CV và JD đều phải có văn bản."},
        )
    try:
        ensure_pair(request.cv_text, request.jd_text)
    except InvalidDocumentError as error:
        raise _invalid_document_http_error(error) from error


def create_app() -> FastAPI:
    app = FastAPI(
        title="CV–JD Matching API",
        version="0.1.0",
        description="Extract structured CV data and return explainable CV-to-JD matches.",
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

    @app.post("/api/validate-document", tags=["extraction"])
    async def validate_document(request: DocumentValidationRequest) -> dict[str, object]:
        """Kiểm tra văn bản có đúng là CV / JD hay không (gọi sau khi trích xuất văn bản)."""
        try:
            (ensure_cv if request.kind == "cv" else ensure_jd)(request.text)
        except InvalidDocumentError as error:
            raise _invalid_document_http_error(error) from error
        return {"valid": True, "kind": request.kind}

    @app.post("/api/extract-information", tags=["extraction"])
    async def extract_information(request: InformationExtractionRequest) -> dict[str, object]:
        """Extract the structured CV profile; JD is retained for the next NLP phase."""
        _validate_request(request)
        return {
            "cv_profile": extract_cv_profile(request.cv_text),
            "jd_profile": extract_job_profile(request.jd_text),
        }

    @app.post("/api/match", tags=["matching"])
    async def match_information(request: InformationExtractionRequest) -> dict[str, object]:
        """Extract both profiles and return an evidence-backed matching report."""
        _validate_request(request)
        cv_profile = extract_cv_profile(request.cv_text)
        jd_profile = extract_job_profile(request.jd_text)
        return match_profiles(cv_profile, jd_profile)

    return app


app = create_app()