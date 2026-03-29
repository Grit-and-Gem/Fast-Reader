# FastReader

A web-based speed reading simulator that trains your brain to read faster using the **RSVP (Rapid Serial Visual Presentation)** technique. Words are displayed one at a time at a configurable pace, with an **Optimal Recognition Point (ORP)** focus letter highlighted in red — keeping your eye anchored at the same position on screen so you never lose your place.

---

## Features

### Speed Reading Engine
- **RSVP display** — one word shown at a time, eliminating subvocalisation and eye movement
- **Optimal Recognition Point (ORP)** — a single focus letter per word is highlighted in red, positioned at the natural eye-landing point (~1/3 into the word). Your eye stays fixed; your brain processes the word around it
- **Fixed speed** — 100 to 1200 WPM, adjustable live during playback
- **Variable speed mode** — speed gradually ramps from a minimum to a maximum WPM at a configurable rate (WPM/min), with a live WPM display showing the current effective speed

### Input Options
- **Paste text** — copy any text into the textarea and load instantly. Markdown formatting is automatically stripped
- **PDF upload** — upload a `.pdf` file; the backend extracts text with automatic **footnote removal** (footnotes and superscript reference numbers are filtered out using font-size and position analysis)
- **Drag and drop** — drag a PDF onto the upload area to load it

### Customisation
- **8 font families** — Georgia, Arial, Verdana, Courier New, Times New Roman, Trebuchet MS, Roboto, Open Sans
- **Font size** — 24px to 96px via slider
- **Adjustable paragraph gap** — toggle on/off with a multiplier slider (1x–10x of normal word interval, default 3x). When enabled, playback pauses at paragraph boundaries to give your brain time to process
- **All settings** update in real time with no reload required

### PDF Viewer
- **Page thumbnail preview** — shows a small preview of the current PDF page, updates automatically as you read across page boundaries
- **Zoom modal** — click "Zoom" to open a hi-res full-screen view of the current page (press `Escape` to close)
- **Page navigation** — jump to previous/next page
- **Paragraph navigation** — jump to previous/next paragraph within or across pages
- **Footnote removal** — footnotes and superscript reference numbers are automatically detected and excluded from the reading text using font-size analysis and page-position heuristics

### Playback Controls
| Control | Action |
|---|---|
| Play / Pause | Start or pause playback |
| Restart | Jump back to word 1 |
| Step back | Move one word backward |
| Step forward | Move one word forward |
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
| `PageDown` | Next page (PDF) / next paragraph (text) |
| `PageUp` | Previous page (PDF) / previous paragraph (text) |
| `Escape` | Close PDF zoom modal |

### Focus Music
- **Background audio player** — upload any MP3/audio file to play as focus music while reading
- **Controls** — play/pause, volume slider, loop toggle
- Runs entirely client-side (no server upload needed)
- Includes a curated list of 10 suggested focus music artists (Tycho, Boards of Canada, Marconi Union, Kiasmos, Nils Frahm, Bonobo, and more)

### UI
- **Dark mode only** — deep dark background (`#0d0d1a`), white text, red focus letter (`#e74c3c`)
- **Remaining time estimate** shown in real time
- **Word counter** showing current position and total words
- **Live WPM display** when using variable speed mode

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

### `POST /api/upload-text`

Accepts plain text (markdown is automatically stripped) and returns a list of words.

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

Accepts a PDF file upload and returns extracted words with per-page metadata.

**Request:** `multipart/form-data` with a `file` field containing the `.pdf` file.

**Response:**
```json
{
  "words": ["extracted", "words", "__PARA__", "from", "pdf", "..."],
  "count": 1234,
  "pages": [
    {
      "start_index": 0,
      "thumbnail": "data:image/png;base64,...",
      "thumbnail_hires": "data:image/png;base64,..."
    },
    {
      "start_index": 245,
      "thumbnail": "data:image/png;base64,...",
      "thumbnail_hires": "data:image/png;base64,..."
    }
  ]
}
```

- `words` — flat array of word tokens with `__PARA__` sentinels at paragraph/page boundaries
- `pages` — per-page metadata with word index boundaries and base64 thumbnails (0.5x for preview, 1.5x for zoom)
- Footnotes are automatically excluded from the extracted text

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
| Variable Speed Min WPM | 50 – 1000 | 200 |
| Variable Speed Max WPM | 100 – 1200 | 600 |
| Variable Speed Ramp Rate | 5 – 200 WPM/min | 50 |
| Font family | 8 options | Georgia |
| Font size | 24px – 96px | 52px |
| Paragraph gap | On/Off + 1x – 10x multiplier | On, 3x |

A comfortable starting point for most readers is **250–350 WPM**. Trained speed readers can work comfortably at 600–800 WPM. Use variable speed mode to gradually build up your reading pace over time.

---

## How Footnote Removal Works

When processing PDF files, FastReader uses PyMuPDF's structured text extraction (`get_text("dict")`) to analyze each text span's font size and position:

1. **Identify body font** — the most common font size (weighted by character count) is determined as the body text size
2. **Filter superscript references** — spans with font size more than 1pt smaller than body text and 3 characters or fewer are removed (catches footnote numbers like ¹, ², ³)
3. **Filter footnote text** — text blocks in the bottom 18% of the page with smaller-than-body font size are excluded

This handles most professionally typeset PDFs (books, papers, articles) without requiring manual configuration.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
