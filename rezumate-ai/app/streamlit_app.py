"""
Rezumate AI — Streamlit Frontend
─────────────────────────────────
Simple web UI for uploading resumes, pasting JDs, and getting optimized PDFs.
"""

import streamlit as st
import requests
import json
import time

API_URL = "http://localhost:8000"

# ── Page Config ──
st.set_page_config(
    page_title="Rezumate AI",
    page_icon="📄",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS ──
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: 800;
        background: linear-gradient(135deg, #818cf8, #6366f1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: center;
        margin-bottom: 0.5rem;
    }
    .sub-header {
        text-align: center;
        color: #9ca3af;
        margin-bottom: 2rem;
    }
    .score-card {
        background: #1a1a2e;
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        border: 1px solid #333;
    }
    .score-big {
        font-size: 3rem;
        font-weight: 800;
    }
</style>
""", unsafe_allow_html=True)

# ── Header ──
st.markdown('<div class="main-header">Rezumate AI</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-header">Agentic AI Resume Optimizer — 100% Open Source, Zero Cost</div>', unsafe_allow_html=True)

# ── Sidebar ──
with st.sidebar:
    st.header("⚙️ Settings")
    template = st.selectbox(
        "Resume Template",
        ["modern", "minimal", "professional"],
        index=0,
        help="LaTeX template for the output PDF"
    )

    st.divider()
    st.header("🏥 System Health")
    try:
        health = requests.get(f"{API_URL}/health", timeout=5).json()
        if health["status"] == "healthy":
            st.success(f"✅ API Connected")
            st.success(f"✅ Ollama: {', '.join(health.get('models', []))}")
        else:
            st.warning(f"⚠️ Ollama not connected — rule-based features still work")
    except Exception:
        st.error("❌ API not running. Start with: `uvicorn app.main:app`")

    st.divider()
    st.caption("Built with: LangGraph + MCP + LaTeX + Ollama")
    st.caption("LLM: Qwen2 1.5B (local, free)")

# ── Main Content ──
col1, col2 = st.columns(2)

with col1:
    st.subheader("📤 Upload Resume")
    uploaded_file = st.file_uploader(
        "Drop your resume (PDF or DOCX)",
        type=["pdf", "docx"],
        help="Your resume will be parsed locally — nothing leaves your machine"
    )

with col2:
    st.subheader("📋 Paste Job Description")
    job_description = st.text_area(
        "Paste the full job description here",
        height=250,
        placeholder="We are looking for a Senior Software Engineer with experience in..."
    )

# ── Action Button ──
st.divider()

col_btn1, col_btn2, col_btn3 = st.columns([1, 2, 1])
with col_btn2:
    optimize_btn = st.button(
        "🚀 Optimize Resume",
        use_container_width=True,
        type="primary",
        disabled=not (uploaded_file and job_description),
    )

# ── Processing ──
if optimize_btn and uploaded_file and job_description:
    with st.spinner("🧠 Running Rezumate AI agentic pipeline..."):
        progress = st.progress(0)
        status = st.empty()

        # Step 1: Upload & Parse
        status.text("📄 Parsing resume...")
        progress.progress(15)
        time.sleep(0.3)

        # Step 2: Score
        status.text("📊 Running ATS analysis...")
        progress.progress(30)

        # Step 3: Match
        status.text("🎯 Matching keywords semantically...")
        progress.progress(50)

        # Step 4: Rewrite
        status.text("✍️ Rewriting weak bullets with AI...")
        progress.progress(70)

        # Step 5: Build PDF
        status.text("📐 Building LaTeX PDF...")
        progress.progress(85)

        # Call API
        try:
            files = {"resume": (uploaded_file.name, uploaded_file.getvalue())}
            data = {"job_description": job_description, "template": template}
            response = requests.post(f"{API_URL}/optimize", files=files, data=data, timeout=120)

            progress.progress(100)
            status.text("✅ Done!")

            if response.status_code == 200:
                result = response.json()

                # ── Results Display ──
                st.divider()
                st.subheader("📊 Results")

                # Score cards
                r1, r2, r3, r4 = st.columns(4)

                score = result.get("ats_score", {})
                with r1:
                    grade = score.get("grade", "?")
                    color = {"A": "#4ade80", "B": "#60a5fa", "C": "#facc15", "D": "#fb923c", "F": "#ef4444"}.get(grade, "#9ca3af")
                    st.metric("ATS Score", f"{score.get('overall_score', 0)}%")

                with r2:
                    st.metric("Grade", grade)

                with r3:
                    kw = score.get("keywords", {})
                    st.metric("Keywords Matched", f"{kw.get('matched', 0)}/{kw.get('jd_keywords_found', 0)}")

                with r4:
                    st.metric("Iterations", result.get("iterations", 0))

                # Verdict
                st.info(score.get("verdict", ""))

                # Missing keywords
                missing = score.get("keywords", {}).get("missing_keywords", [])
                if missing:
                    st.warning(f"**Missing Keywords:** {', '.join(missing[:15])}")

                # Download PDF
                job_id = result.get("job_id", "")
                if job_id:
                    st.divider()
                    pdf_data = requests.get(f"{API_URL}/download/{job_id}").content
                    st.download_button(
                        "📥 Download Optimized Resume (PDF)",
                        data=pdf_data,
                        file_name=f"rezumate_{job_id}.pdf",
                        mime="application/pdf",
                        use_container_width=True,
                    )

                # Pipeline log
                with st.expander("🔧 Pipeline Log"):
                    for msg in result.get("messages", []):
                        st.json(msg)

            else:
                st.error(f"Error: {response.text}")

        except requests.exceptions.ConnectionError:
            st.error("Cannot connect to API. Make sure the backend is running: `uvicorn app.main:app --reload`")
        except Exception as e:
            st.error(f"Unexpected error: {str(e)}")

# ── Footer ──
st.divider()
st.caption("Rezumate AI v1.0 — Open Source | MCP + LangGraph + LaTeX + Ollama | $0/month")
