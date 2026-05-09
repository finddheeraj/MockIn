# MockMind — AI Interview Simulator (Modular)

Most interview prep tools give you a question bank and a timer. MockIn does something different — it puts 5 specialized AI agents to work simultaneously, each with a distinct role, every time you submit an answer.

🤖 The Agentic Pipeline

Every answer you give triggers this sequence in real-time:

1️⃣ Scorer Agent — Evaluates your response across 5 dimensions: clarity, depth, accuracy, examples, and structure. Low-temperature LLM call for consistent, calibrated scoring.

2️⃣ Adaptive Controller — The brain of the system. Analyzes your scores and decides what happens next: drill deeper into your weak spots, switch to a new subtopic, or increase the difficulty. On alternating rounds it uses LLM reasoning; on others it uses rule-based thresholds — a deliberate hybrid to balance cost and responsiveness.

3️⃣ Knowledge Base Lookup — A zero-LLM-call step that retrieves curated reference data (key concepts, ideal answer points, common mistakes) from structured JSON files indexed by topic and difficulty. Grounds both agents in factual expectations without burning tokens.

4️⃣ Recruiter + Coach Agents (parallel) — Run simultaneously via ThreadPoolExecutor:
   → Recruiter asks the next adaptive follow-up question
   → Coach delivers private, emoji-formatted feedback only you can see

5️⃣ Evaluator Agent — At session end, synthesizes your full transcript and score progression into a structured scorecard with strengths, weaknesses, and a personalized improvement plan. Downloadable as a PDF.

🎯 Why this matters for interview prep

Traditional prep is static. You read a solution, feel like you understand it, and then blank in the actual interview. MockIn replicates the pressure of a real technical interview — follow-up questions that dig into gaps, real-time feedback you can act on, and a difficulty curve that adapts to you, not a fixed script.

The adaptive controller means if you nail a System Design question, it won't waste your time on basics — it'll push you to Staff-level tradeoffs. If you struggle with a concept, it drills it from multiple angles before moving on.


## Project Structure

```
mock-interviewer-v2/
│
├── app.py              # Entry point: creates Flask app, registers blueprints
├── config.py           # All settings: API keys, topics, difficulties, model params
├── llm_client.py       # xAI/Grok client factory (used by both agents)
│
├── agents/             # The two AI agents — each in its own file
│   ├── __init__.py
│   ├── recruiter.py    # Agent A: strict technical interviewer
│   └── coach.py        # Agent B: silent real-time coach
│
├── routes/             # Flask route blueprints — one file per concern
│   ├── __init__.py
│   ├── pages.py        # GET / → renders the HTML page
│   └── interview.py    # POST /start, /answer, /reset — API endpoints
│
├── templates/
│   └── index.html      # Pure HTML markup, no inline CSS or JS
│
├── static/
│   ├── css/
│   │   └── main.css    # All styles, organized into labeled sections
│   └── js/
│       └── app.js      # All client logic, split into State/UI/Chat/API/Wiring
│
├── requirements.txt
├── render.yaml         # One-click Render deploy
└── README.md
```

## What each file does

| File | Responsibility |
|------|---------------|
| `app.py` | Creates the Flask app and wires blueprints together |
| `config.py` | Single source of truth for all constants (topics, model, API key) |
| `llm_client.py` | Creates the xAI client — one place to change base URL or auth |
| `agents/recruiter.py` | Agent A logic: opening question + follow-up drilling |
| `agents/coach.py` | Agent B logic: transcript analysis + coaching bullets |
| `routes/pages.py` | Serves the HTML index page |
| `routes/interview.py` | `/start`, `/answer`, `/reset` API endpoints |
| `templates/index.html` | Clean HTML — no embedded styles or scripts |
| `static/css/main.css` | All styles with section comments |
| `static/js/app.js` | Client logic in 5 labeled sections |

## Local Setup

```bash
cd mock-interviewer-v2
pip install -r requirements.txt
export XAI_API_KEY=your_key_here
python app.py
# Visit http://localhost:5000

OR
if you have more then 8GB of RAM in your laptop
download Llama-3.1-8B.gguf from hugging face
update .env file with following variables
LLM_PROVIDER=local
LOCAL_MODEL_PATH=your Path of Llama model
LOCAL_MODEL_CONTEXT_SIZE=4096
LOCAL_MODEL_GPU_LAYERS=0

python app.py
# Visit http://localhost:5000


🔗 Try it live → https://mockin-u03v.onrender.com/


```

