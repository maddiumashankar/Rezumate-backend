"""
Rezumate AI — FastAPI Backend
─────────────────────────────
REST API for the Rezumate AI agentic pipeline.
Handles file uploads, triggers the LangGraph workflow, and streams results.
"""

import os
import json
import uuid
import shutil
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import the LangGraph pipeline
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from agents.graph import run_rezumate

app = FastAPI(
    title="Rezumate AI",
    description="Zero-cost Agentic AI for resume optimization — MCP + LaTeX + Lightweight LLM",
    version="1.0.0",
)

# CORS for Streamlit / frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Storage ──
UPLOAD_DIR = Path("data/uploads")
OUTPUT_DIR = Path("data/outputs")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ── Models ──

class OptimizeRequest(BaseModel):
    job_description: str
    template: str = "modern"  # "modern", "minimal", "professional"


class OptimizeResponse(BaseModel):
    job_id: str
    status: str
    ats_score: dict
    skill_matches: dict
    iterations: int
    pdf_url: str
    messages: list


# ── Routes ──

@app.get("/")
async def root():
    return {
        "name": "Rezumate AI",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "POST /optimize": "Upload resume + JD → Get optimized PDF",
            "POST /parse": "Upload resume → Get parsed structure",
            "POST /score": "Score resume against JD",
            "GET /templates": "List available LaTeX templates",
            "GET /download/{job_id}": "Download generated PDF",
        },
    }


@app.post("/optimize", response_model=OptimizeResponse)
async def optimize_resume(
    resume: UploadFile = File(...),
    job_description: str = Form(...),
    template: str = Form("modern"),
):
    """
    Main endpoint: Upload resume + JD → Run full agentic pipeline → Return optimized PDF.
    """
    # Validate file type
    if not resume.filename.lower().endswith(('.pdf', '.docx')):
        raise HTTPException(400, "Only PDF and DOCX files are supported")

    # Save uploaded file
    job_id = str(uuid.uuid4())[:8]
    upload_path = UPLOAD_DIR / f"{job_id}_{resume.filename}"

    with open(upload_path, "wb") as f:
        shutil.copyfileobj(resume.file, f)

    # Run the agentic pipeline
    try:
        result = run_rezumate(
            resume_path=str(upload_path),
            job_description=job_description,
            template=template,
        )
    except Exception as e:
        raise HTTPException(500, f"Pipeline error: {str(e)}")

    # Move PDF to output directory
    pdf_source = result.get("pdf_path", "")
    pdf_output = ""
    if pdf_source and os.path.exists(pdf_source):
        pdf_filename = f"{job_id}_optimized.pdf"
        pdf_output = str(OUTPUT_DIR / pdf_filename)
        shutil.move(pdf_source, pdf_output)

    return OptimizeResponse(
        job_id=job_id,
        status="completed",
        ats_score=result.get("ats_score", {}),
        skill_matches=result.get("skill_matches", {}),
        iterations=result.get("iterations", 0),
        pdf_url=f"/download/{job_id}" if pdf_output else "",
        messages=result.get("messages", []),
    )


@app.post("/parse")
async def parse_resume(resume: UploadFile = File(...)):
    """Parse a resume file and return structured data (no JD needed)."""
    from mcp_servers.resume_parser.server import (
        extract_text_from_pdf,
        extract_contact_info,
        extract_sections,
        extract_skills,
        extract_experience,
        extract_education,
    )

    # Save file
    job_id = str(uuid.uuid4())[:8]
    upload_path = UPLOAD_DIR / f"{job_id}_{resume.filename}"
    with open(upload_path, "wb") as f:
        shutil.copyfileobj(resume.file, f)

    # Parse
    raw_text = extract_text_from_pdf(str(upload_path))
    contact = extract_contact_info(raw_text)
    sections = extract_sections(raw_text)

    return {
        "contact": contact,
        "summary": sections.get("summary", ""),
        "skills": extract_skills(sections.get("skills", "")),
        "experience": extract_experience(sections.get("experience", "")),
        "education": extract_education(sections.get("education", "")),
        "word_count": len(raw_text.split()),
        "sections_found": list(sections.keys()),
    }


@app.post("/score")
async def score_resume_endpoint(
    resume: UploadFile = File(...),
    job_description: str = Form(...),
):
    """Score a resume against a JD without rewriting."""
    from mcp_servers.resume_parser.server import (
        extract_text_from_pdf, extract_contact_info, extract_sections,
        extract_skills, extract_experience, extract_education,
    )
    from mcp_servers.ats_scorer.server import score_resume

    job_id = str(uuid.uuid4())[:8]
    upload_path = UPLOAD_DIR / f"{job_id}_{resume.filename}"
    with open(upload_path, "wb") as f:
        shutil.copyfileobj(resume.file, f)

    raw_text = extract_text_from_pdf(str(upload_path))
    contact = extract_contact_info(raw_text)
    sections = extract_sections(raw_text)

    parsed = {
        "contact": contact,
        "summary": sections.get("summary", ""),
        "skills": extract_skills(sections.get("skills", "")),
        "experience": extract_experience(sections.get("experience", "")),
        "education": extract_education(sections.get("education", "")),
        "raw_text": raw_text,
        "word_count": len(raw_text.split()),
    }

    result = score_resume(parsed, job_description)
    return result


@app.get("/templates")
async def list_templates():
    """List available LaTeX resume templates."""
    return [
        {"name": "modern", "description": "Clean, single-column, ATS-friendly. Best for most roles."},
        {"name": "minimal", "description": "Ultra-clean with maximum whitespace. Good for design/creative."},
        {"name": "professional", "description": "Traditional layout. Best for senior/executive roles."},
    ]


@app.get("/download/{job_id}")
async def download_pdf(job_id: str):
    """Download a generated PDF."""
    pdf_path = OUTPUT_DIR / f"{job_id}_optimized.pdf"
    if not pdf_path.exists():
        raise HTTPException(404, "PDF not found. It may have expired.")
    return FileResponse(str(pdf_path), media_type="application/pdf", filename=f"rezumate_{job_id}.pdf")


@app.get("/health")
async def health_check():
    """Health check — verify Ollama is running."""
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://localhost:11434/api/tags", timeout=5)
            models = resp.json().get("models", [])
            return {"status": "healthy", "ollama": "connected", "models": [m["name"] for m in models]}
    except Exception:
        return {"status": "degraded", "ollama": "not connected", "note": "LLM rewriting unavailable — rule-based features still work"}


# ── Run ──

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
