# 🎯 Rezumate — AI-Powered Resume Optimization Platform

> **Zero-cost, agentic AI that tailors your resume to any job description — delivered via Telegram.**

Rezumate is a comprehensive, full-stack AI resume agent platform. It features a **Node.js/Express REST API and Telegram Bot** for seamless communication, and a **Python AI backend** powered by LangGraph, MCP tool servers, and lightweight local LLMs. It parses resumes, scores them against job descriptions, rewrites weak content, and generates polished LaTeX PDFs — all without relying on expensive paid APIs.

---

## 🏗️ Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                                │
│                          ┌──────────────────────┐                      │
│                          │ Telegram Bot (Mobile)│                      │
│                          └──────────┬───────────┘                      │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Node.js / TypeScript Layer                           │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌────────────────────┐   │
│  │ Telegraf │  │   State    │  │  SQLite   │  │ Express REST API   │   │
│  │   Bot    │──│  Machine   │──│   (DB)    │──│ (Frontend Gateway) │   │
│  └──────────┘  └────────────┘  └───────────┘  └────────────────────┘   │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ HTTP / API Calls
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Python / AI Layer (rezumate-ai)                      │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │               LangGraph Agentic Pipeline                     │      │
│  │                                                              │      │
│  │  Parse ──▶ ATS Score ──▶ Match ──▶ Rewrite ──▶ LaTeX ──▶ QA │      │
│  │                                     (LLM)         │         │      │
│  │                                       ▲           │         │      │
│  │                                       └───────────┘         │      │
│  │                                      (loop if score < 70)   │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌────────────┐    │
│  │ MCP: Parser  │ │ MCP: Scorer  │ │ MCP: Matcher  │ │MCP: LaTeX  │    │
│  │  (PyMuPDF)   │ │  (TF-IDF)    │ │(Sentence-BERT)│ │ (Builder)  │    │
│  └──────────────┘ └──────────────┘ └───────────────┘ └────────────┘    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │           Ollama (Local LLM: qwen2:1.5b)                     │      │
│  │           Only used for bullet rewriting & summary gen       │      │
│  └──────────────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```text
Rezumate/
├── src/                          # Node.js / TypeScript — API & Telegram Bot
│   ├── index.ts                  # Main entry point
│   ├── api/                      # Express REST API (routes & server)
│   ├── bot/                      # Telegraf bot setup, commands & handlers
│   ├── state-machine/            # Conversation state transitions
│   ├── database/                 # SQLite/Drizzle database configuration
│   ├── services/                 # Orchestration services (LLM, PDF, JD)
│   ├── agents/                   # Agent logic for resume tailoring & skills
│   └── utils/                    # Helpers, formatting, and validation
│
├── rezumate-ai/                  # Python — AI Agentic Backend
│   ├── agents/
│   │   └── graph.py              # LangGraph workflow (the core AI brain)
│   ├── app/
│   │   └── main.py               # FastAPI microservice interface
│   ├── mcp_servers/              # Model Context Protocol tool servers
│   │   ├── resume_parser/        # PDF/DOCX → structured data (PyMuPDF)
│   │   ├── ats_scorer/           # ATS scoring (TF-IDF, rule-based)
│   │   ├── keyword_matcher/      # Semantic matching (sentence-transformers)
│   │   └── latex_builder/        # LaTeX resume generation & compilation
│   ├── knowledge_base/           # ATS rules, power verbs, industry keywords
│   ├── config/
│   │   └── mcp_config.json       # MCP server & LLM configuration
│   └── docker-compose.yml        # Full stack containerization
│
├── templates/                    # LaTeX Resume template definitions
├── .env.example                  # Environment variable template
├── package.json                  # Backend dependencies
└── tsconfig.json
```

---

## 🧠 How It Works

### The LangGraph Pipeline (`rezumate-ai/agents/graph.py`)

The AI pipeline runs a **self-correcting loop** orchestrated by LangGraph. To optimize costs and speed, **only one node uses an LLM** — the rest utilize deterministic MCP (Model Context Protocol) tools:

| Node | Tool | LLM? | What It Does |
|------|------|------|-------------|
| **1. Parse Resume** | MCP `resume-parser` | ❌ | Extracts text, contact info, skills, experience from PDF/DOCX |
| **2. ATS Score** | MCP `ats-scorer` | ❌ | Scores resume against JD using TF-IDF and keyword matching |
| **3. Keyword Match** | MCP `keyword-matcher` | ❌ | Semantic similarity matching using sentence-transformers |
| **4. LLM Rewrite** | Ollama (qwen2:1.5b) | ✅ | Rewrites weak bullets and generates a tailored summary |
| **5. Build LaTeX** | MCP `latex-builder` | ❌ | Merges rewritten content into LaTeX → compiles to PDF |
| **6. Quality Check** | MCP `ats-scorer` | ❌ | Re-scores; if score < 70, loops back to step 4 (max 2 iterations) |

### User Interface

Users interact with Rezumate through an open-ended, fully conversational **Telegram Bot** UI:
* **Agentic Intent Routing**: Obsolete command menus and inline buttons are completely removed. A dynamic LLM classifier categorizes requests on-the-fly (e.g. ATS scoring, skills gap, career roadmap resource compilation, resume editing, or PDF export).
* **Flexible Dependency Resolution**: Resume or Job Description details can be uploaded or pasted at any point. The bot pauses, caches the pending action, and resumes automatically once documents are received.
* **On-Demand PDF Exports**: Instead of compiling files automatically, the bot generates custom filename suggestions (e.g. `[Name]_Resume.pdf`, `[Name]_CV.pdf`) and compiles the document only when requested by the user, saving resources.
* **Zero-Crash HTML Formatting**: Powered by a custom tokenized Markdown-to-HTML parser that prevents Telegram entity parse crashes from unclosed formatting tags in AI responses.
* **Command Registry**: Keeps commands minimal and direct:
  * `/start` - Start conversational onboarding.
  * `/cancel` / `/exit` - Clear active context back to IDLE.
  * `/reset` - Permanently delete all profile records, resumes, and session data.

---

## 🔧 Tech Stack

### Node.js API & Bot Layer
| Component | Technology |
|-----------|-----------|
| API Framework | Express.js |
| Bot Framework | Telegraf 4.x |
| Language | TypeScript 5.x |
| Database | SQLite (sql.js / Drizzle) |
| PDF Generation | PDFKit |

### Python AI Layer
| Component | Technology |
|-----------|-----------|
| Orchestration | LangGraph + LangChain |
| API Framework | FastAPI + Uvicorn |
| LLM (local) | Ollama → Qwen2 1.5B / Phi-3 Mini |
| Embeddings | sentence-transformers (local) |
| Tool Protocol | MCP (Model Context Protocol) |
| Output | LaTeX Compilation |

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

# 1. Install Backend/API dependencies
npm install

# 2. Install Python AI dependencies
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

### 4. Run the Platform

You'll need to start multiple layers for the experience:

```bash
# Terminal 1: Run the Node.js API & Telegram Bot
npm run dev

# Terminal 2: Run the Python AI Backend
cd rezumate-ai
uvicorn app.main:app --reload --port 8000
```

*(Alternatively, use Docker for the AI backend via `docker compose up` inside `rezumate-ai`)*

---

## 💡 Design Principles

- **Zero API Cost**: Core tailoring runs locally via Ollama.
- **LLM-Minimal Workflow**: The LLM is strictly isolated to bullet rewriting and summary generation. Heavy lifting like parsing, ATS scoring, and PDF generation are handled by fast, deterministic MCP tools.
- **Self-Correcting**: The AI pipeline loops up to 2× automatically if the ATS score remains below an acceptable threshold (70).
- **Headless AI Backend**: LangGraph is exposed as a microservice, allowing the Telegram bot to securely consume the AI logic.

---

## 📄 License

MIT

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/maddiumashankar">maddiumashankar</a>
</p>