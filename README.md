# MockMind — AI Interview Simulator (Modular)

A two-agent mock interview app using Grok (xAI) via Flask.

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
```

## Deploy on Render

1. Push this folder to GitHub
2. Render → New Web Service → connect repo
3. Set env var: `XAI_API_KEY` (from https://console.x.ai)
4. Build: `pip install -r requirements.txt`
5. Start: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
