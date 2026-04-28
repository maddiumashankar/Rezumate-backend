# 🎯 Rezumate — AI-Powered Resume Optimization Agent

> **Zero-cost, agentic AI that tailors your resume to any job description — delivered via Telegram.**

Rezumate is a dual-layer system: a **Node.js Telegram bot** that handles user interaction and a **Python AI backend** powered by LangGraph, MCP tool servers, and lightweight local LLMs. It parses resumes, scores them against job descriptions, rewrites weak content, and generates polished LaTeX PDFs — all without paid APIs.

---

## 🏗️ Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                         USER (Telegram)                              │
└──────────────────────────────┬────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Node.js / TypeScript Layer                         │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Telegraf  │  │   State    │  │  SQLite   │  │   Services       │  │
│  │   Bot     │──│  Machine   │──│   (sql.js)│  │ (PDF, LLM, JD)  │  │
│  └──────────┘  └────────────┘  └───────────┘  └──────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Python / AI Layer (rezumate-ai)                    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │               LangGraph Agentic Pipeline                     │    │
│  │                                                              │    │
│  │  Parse ──▶ ATS Score ──▶ Match ──▶ Rewrite ──▶ LaTeX ──▶ QA │    │
│  │                                     (LLM)         │         │    │
│  │                                       ▲           │         │    │
│  │                                       └───────────┘         │    │
│  │                                      (loop if score < 70)   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌────────────┐ │
│  │ MCP: Parser  │ │ MCP: Scorer  │ │ MCP: Matcher  │ │MCP: LaTeX  │ │
│  │  (PyMuPDF)   │ │  (TF-IDF)   │ │(Sentence-BERT)│ │ (Builder)  │ │
│  └──────────────┘ └──────────────┘ └───────────────┘ └────────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │           Ollama (Local LLM: qwen2:1.5b)                     │    │
│  │           Only used for bullet rewriting & summary gen       │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
Rezumate/
├── src/                          # Node.js / TypeScript — Telegram Bot
│   ├── index.ts                  # App entry point
│   ├── bot/
│   │   ├── index.ts              # Telegraf bot setup & middleware
│   │   ├── commands/             # /start, /help, /resume, /cancel
│   │   └── handlers/             # Message, callback, document handlers
│   ├── state-machine/
│   │   ├── machine.ts            # Conversation state transitions
│   │   └── states.ts             # State definitions & prompts
│   ├── database/
│   │   ├── db.ts                 # SQLite (sql.js) initialization
│   │   └── repos/                # User, resume, JD, conversation repos
│   ├── services/
│   │   ├── llmService.ts         # Groq API integration
│   │   ├── pdfService.ts         # PDF generation (PDFKit)
│   │   ├── resumeService.ts      # Resume processing logic
│   │   └── jdService.ts          # Job description parsing
│   ├── agents/
│   │   ├── atsScorer.ts          # ATS scoring algorithms
│   │   ├── resumeTailorAgent.ts  # Resume tailoring logic
│   │   ├── skillsAnalyzer.ts     # Skills gap analysis
│   │   └── coverLetterAgent.ts   # Cover letter generation
│   ├── types/                    # TypeScript interfaces
│   └── utils/                    # Logger, parsers, formatters, validators
│
├── rezumate-ai/                  # Python — AI Agentic Backend
│   ├── agents/
│   │   └── graph.py              # LangGraph workflow (the brain)
│   ├── app/
│   │   ├── main.py               # FastAPI REST API
│   │   └── streamlit_app.py      # Streamlit web frontend
│   ├── mcp_servers/              # Model Context Protocol tool servers
│   │   ├── resume_parser/        # PDF/DOCX → structured data (PyMuPDF)
│   │   ├── ats_scorer/           # ATS scoring (TF-IDF, rule-based)
│   │   ├── keyword_matcher/      # Semantic matching (sentence-transformers)
│   │   └── latex_builder/        # LaTeX resume generation & compilation
│   ├── knowledge_base/           # ATS rules, power verbs, industry keywords
│   ├── config/
│   │   └── mcp_config.json       # MCP server & LLM configuration
│   ├── Dockerfile
│   ├── docker-compose.yml        # Full stack: Ollama + API + Streamlit
│   └── pyproject.toml
│
├── templates/                    # Resume template definitions
│   ├── entry-level-tech.json
│   ├── mid-level-tech.json
│   └── senior-management.json
│
├── .env.example                  # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
└── drizzle.config.ts
```

---

## 🧠 How It Works

### The LangGraph Pipeline (`rezumate-ai/agents/graph.py`)

The AI pipeline is a **self-correcting loop** with 6 nodes. Only **one node uses an LLM** — everything else is deterministic MCP tools:

| Node | Tool | LLM? | What It Does |
|------|------|------|-------------|
| **1. Parse Resume** | MCP `resume-parser` | ❌ | Extracts text, contact info, skills, experience from PDF/DOCX |
| **2. ATS Score** | MCP `ats-scorer` | ❌ | Scores resume against JD using TF-IDF and keyword matching |
| **3. Keyword Match** | MCP `keyword-matcher` | ❌ | Semantic similarity matching using sentence-transformers |
| **4. LLM Rewrite** | Ollama (qwen2:1.5b) | ✅ | Rewrites weak bullets and generates a tailored summary |
| **5. Build LaTeX** | MCP `latex-builder` | ❌ | Merges rewritten content into LaTeX → compiles to PDF |
| **6. Quality Check** | MCP `ats-scorer` | ❌ | Re-scores; if score < 70, loops back to step 4 (max 2 iterations) |

### Telegram Bot Conversation Flow

The bot uses a **finite state machine** to guide users through a structured conversation:

```
IDLE → RESUME_UPLOAD → RESUME_REVIEW → JD_UPLOAD → ATS_ANALYSIS
  │                                                      │
  │         CHANGE_APPROVAL ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
  │              │
  │         NEW_CONTENT → FINAL_REVIEW → IDLE
  │
  ├── TEMPLATE_SELECT → RESUME_BUILD → RESUME_REVIEW
  ├── SKILLS_GAP → INTERVIEW_PREP
  └── COVER_LETTER
```

---

## 🔧 Tech Stack

### Node.js Layer (Telegram Bot)
| Component | Technology |
|-----------|-----------|
| Bot Framework | Telegraf 4.x |
| Language | TypeScript 5.x |
| Database | SQLite via sql.js |
| PDF Generation | PDFKit |
| LLM (cloud) | Groq API (Llama 3.3 70B) |
| Logging | Winston |

### Python Layer (AI Backend)
| Component | Technology |
|-----------|-----------|
| Orchestration | LangGraph + LangChain |
| API Framework | FastAPI + Uvicorn |
| Frontend | Streamlit |
| LLM (local) | Ollama → Qwen2 1.5B / Phi-3 Mini |
| Embeddings | sentence-transformers (local) |
| PDF Parsing | PyMuPDF |
| PDF Output | LaTeX |
| Tool Protocol | MCP (Model Context Protocol) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **Ollama** (for local LLM) — [Install Ollama](https://ollama.ai)
- **LaTeX** (for PDF compilation) — `brew install mactex-no-gui` on macOS

### 1. Clone & Install

```bash
git clone https://github.com/maddiumashankar/Rezumate-backend.git
cd Rezumate-backend

# Node.js dependencies
npm install

# Python dependencies
cd rezumate-ai
pip install -e ".[dev]"
cd ..
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your values:
#   TELEGRAM_BOT_TOKEN=<from @BotFather>
#   GROQ_API_KEY=<from console.groq.com>
```

### 3. Pull the LLM Model

```bash
ollama pull qwen2:1.5b
```

### 4. Run

```bash
# Option A: Run the Telegram bot (Node.js)
npm run dev

# Option B: Run the AI API (Python)
cd rezumate-ai
uvicorn app.main:app --reload --port 8000

# Option C: Run everything with Docker
cd rezumate-ai
docker compose up
```

---

## 📡 API Endpoints (Python Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/optimize` | Upload resume + JD → Full pipeline → Optimized PDF |
| `POST` | `/parse` | Upload resume → Parsed structured data |
| `POST` | `/score` | Score resume against a JD (no rewriting) |
| `GET` | `/templates` | List available LaTeX templates |
| `GET` | `/download/{job_id}` | Download a generated PDF |
| `GET` | `/health` | Health check (Ollama connectivity) |

---

## 🤖 Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Begin onboarding flow |
| `/resume` | Start resume upload & tailoring |
| `/help` | Show available commands |
| `/cancel` | Reset conversation to IDLE |

---

## 🐳 Docker Deployment

The `rezumate-ai/docker-compose.yml` spins up the full stack:

| Service | Port | Description |
|---------|------|-------------|
| `ollama` | 11434 | Local LLM server |
| `api` | 8000 | FastAPI backend |
| `frontend` | 8501 | Streamlit web UI |

```bash
cd rezumate-ai
docker compose up -d
```

---

## 💡 Design Principles

- **Zero API Cost**: All AI runs locally via Ollama. Groq is optional for the Telegram bot layer.
- **LLM-Minimal**: The LLM is only used for bullet rewriting and summary generation. Parsing, scoring, matching, and PDF building are all rule-based MCP tools.
- **Self-Correcting**: The pipeline loops up to 2× if ATS score stays below 70.
- **Modular MCP Servers**: Each capability is an independent MCP server — easy to test, replace, or scale individually.

---

## 📄 License

MIT

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/maddiumashankar">maddiumashankar</a>
</p>