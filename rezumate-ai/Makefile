# ── Rezumate AI — Quick Commands ──

.PHONY: setup run-local run-docker test clean

# ── Local Setup (no Docker) ──
setup:
	@echo "📦 Installing Python dependencies..."
	pip install -e ".[dev]"
	@echo "🦙 Installing Ollama..."
	curl -fsSL https://ollama.com/install.sh | sh
	@echo "🤖 Pulling lightweight model..."
	ollama pull qwen2:1.5b
	@echo "🔤 Downloading embedding model (first run only)..."
	python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
	@echo "✅ Setup complete!"

# ── Run Locally ──
run-api:
	@echo "🚀 Starting Rezumate API on http://localhost:8000"
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

run-ui:
	@echo "🌐 Starting Streamlit UI on http://localhost:8501"
	streamlit run app/streamlit_app.py

run-ollama:
	@echo "🦙 Starting Ollama LLM server..."
	ollama serve

run-local:
	@echo "🚀 Starting all services (run in separate terminals):"
	@echo "  Terminal 1: make run-ollama"
	@echo "  Terminal 2: make run-api"
	@echo "  Terminal 3: make run-ui"

# ── Docker ──
run-docker:
	@echo "🐳 Starting all services with Docker..."
	docker-compose up --build

stop-docker:
	docker-compose down

# ── Test ──
test:
	pytest tests/ -v

# ── Clean ──
clean:
	rm -rf data/uploads/* data/outputs/*
	rm -rf __pycache__ **/__pycache__
	find . -name "*.pyc" -delete
