# FastReader

A web-based speed reading simulator that trains your brain to read faster using the **RSVP (Rapid Serial Visual Presentation)** technique. Words are displayed one at a time at a configurable pace, with an **Optimal Recognition Point (ORP)** focus letter highlighted in red — keeping your eye anchored at the same position on screen so you never lose your place.

---

## Screenshot

```
┌──────────────────────────────────────────────────────┐
│                    FastReader                        │
│           Train your brain to read faster            │
├──────────────────────────────────────────────────────┤
│  [ Paste Text ]  [ Upload PDF ]                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Paste your text here...                     │   │
│  └──────────────────────────────────────────────┘   │
│  [ Load Text ]                                       │
├──────────────────────────────────────────────────────┤
│  Speed  ──────●──────  300  WPM                      │
│  Font   [ Georgia ▾ ]                                │
│  Size   ────●────────   52  px                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│              under  S  tanding                       │
│                     ↑                                │
│               (focus letter)                         │
│                                                      │
├──────────────────────────────────────────────────────┤
│  ████████████░░░░░░░░░░░░░░░  (progress bar)         │
├──────────────────────────────────────────────────────┤
│  142 / 3562    ⏮  ◀  ▶▌  ▶  ▶⏭    ~9m 12s left     │
└──────────────────────────────────────────────────────┘
```

---

## Features

### Speed Reading Engine
- **RSVP display** — one word shown at a time, eliminating subvocalisation and eye movement
- **Optimal Recognition Point (ORP)** — a single focus letter per word is highlighted in red, positioned at roughly the natural eye-landing point (~1/3 into the word). Your eye stays fixed; your brain processes the word around it
- **Speed range** — 100 to 1200 Words Per Minute (WPM), adjustable live during playback
- **Live speed update** — changing WPM takes effect on the very next word with no restart needed

### Input Options
- **Paste text** — copy any text into the textarea and load instantly
- **PDF upload** — upload a `.pdf` file and the backend extracts all text automatically
- **Drag and drop** — drag a PDF onto the upload area to load it

### Customisation
- **8 font families** — Georgia, Arial, Verdana, Courier New, Times New Roman, Trebuchet MS, Roboto, Open Sans
- **Font size** — 24px to 96px via slider
- **All settings** update in real time with no reload required

### Playback Controls
| Control | Action |
|---|---|
| Play / Pause | Start or pause playback |
| Restart | Jump back to word 1 |
| Step back `◀` | Move one word backward |
| Step forward `▶` | Move one word forward |
| Progress bar | Click anywhere to seek to that position |

### Keyboard Shortcuts
| Key | Action |
|---|---|
| `Space` or `k` | Play / Pause |
| `r` | Restart from beginning |
| `←` | Step one word back |
| `→` | Step one word forward |
| `↑` | Increase speed by 50 WPM |
| `↓` | Decrease speed by 50 WPM |

### UI
- **Dark mode only** — deep dark background (`#0d0d1a`), white text, red focus letter (`#e74c3c`)
- **Remaining time estimate** shown in real time (e.g. `~9m 12s left`)
- **Word counter** showing current position and total words

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | [FastAPI](https://fastapi.tiangolo.com/) (Python) |
| ASGI Server | [Uvicorn](https://www.uvicorn.org/) |
| PDF Parsing | [PyMuPDF](https://pymupdf.readthedocs.io/) (`fitz`) |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (no frameworks) |
| Fonts | Google Fonts (Roboto, Open Sans) + system fonts |

---

## Project Structure

```
Fast-Reader/
├── main.py                 # FastAPI application — API endpoints + static file serving
├── requirements.txt        # Python dependencies
└── static/
    ├── index.html          # Single-page UI
    ├── css/
    │   └── style.css       # Dark theme, ORP layout, all component styles
    └── js/
        └── app.js          # Reader engine, ORP calculation, controls, keyboard shortcuts
```

---

## Getting Started

### Prerequisites
- Python 3.10 or higher
- pip

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Grit-and-Gem/Fast-Reader.git
cd Fast-Reader

# 2. (Optional) Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Linux / macOS
venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r requirements.txt
```

### Running the App

```bash
python main.py
```

The server starts on `http://localhost:8000`. Open that URL in your browser.

Alternatively, use uvicorn directly with auto-reload for development:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## API Reference

The backend exposes two endpoints used by the frontend.

### `POST /api/upload-text`

Accepts plain text and returns a list of words.

**Request body (JSON):**
```json
{ "text": "Your text content here..." }
```

**Response:**
```json
{
  "words": ["Your", "text", "content", "here..."],
  "count": 4
}
```

---

### `POST /api/upload-pdf`

Accepts a PDF file upload and returns extracted words.

**Request:** `multipart/form-data` with a `file` field containing the `.pdf` file.

**Response:**
```json
{
  "words": ["extracted", "words", "from", "pdf", "..."],
  "count": 1234
}
```

**Error responses:**
- `400` — non-PDF file uploaded, PDF could not be parsed, or no text found

---

## How the ORP Works

The **Optimal Recognition Point** is the position within a word where the human eye naturally lands when reading. FastReader calculates this index based on word length:

| Word length | Focus letter index | Example (`*` = focus) |
|---|---|---|
| 1 | 0 | `*a` |
| 2–3 | 0 | `*be`, `*cat` |
| 4–5 | 1 | `r*ead`, `s*peed` |
| 6–9 | 2 | `re*ader`, `th*inking` |
| 10–13 | 3 | `und*erstand` |
| 14+ | 4 | `comp*rehension` |

The three-column CSS flex layout keeps the focus letter at an **identical horizontal pixel position** on screen for every word — your eye never moves left or right.

---

## Configuration

All settings are controlled from the UI — no config files needed. Settings take effect immediately:

| Setting | Range | Default |
|---|---|---|
| Speed (WPM) | 100 – 1200 | 300 |
| Font family | 8 options | Georgia |
| Font size | 24px – 96px | 52px |

A comfortable starting point for most readers is **250–350 WPM**. Trained speed readers can work comfortably at 600–800 WPM.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
