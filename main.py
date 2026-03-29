import io
import re
import base64
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Fast-Reader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


class TextInput(BaseModel):
    text: str


def clean_text(text: str) -> str:
    """Strip markdown / rich-text formatting so the reader sees plain words."""
    # HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Code fences (``` ... ```)
    text = re.sub(r"```[^\S\n]*\w*\n[\s\S]*?```", "", text)
    # Markdown images ![alt](url) → alt
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    # Markdown links [text](url) → text
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    # Bold/italic: **text**, __text__, *text*, _text_
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", text)
    # Strikethrough ~~text~~
    text = re.sub(r"~~(.+?)~~", r"\1", text)
    # Inline code `code`
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Horizontal rules (lines that are only ---, ***, ___)
    text = re.sub(r"^[ \t]*[-*_]{3,}[ \t]*$", "", text, flags=re.MULTILINE)
    # Headings: strip leading # markers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Blockquotes: strip leading >
    text = re.sub(r"^>\s?", "", text, flags=re.MULTILINE)
    # Unordered list markers: *, -, + at line start
    text = re.sub(r"^[ \t]*[*\-+]\s+", "", text, flags=re.MULTILINE)
    # Ordered list markers: 1., 2., etc.
    text = re.sub(r"^[ \t]*\d+\.\s+", "", text, flags=re.MULTILINE)
    return text


def _smart_join_spans(parts: list[str]) -> str:
    """Join text spans within one PDF line, inserting a space where neither
    side already provides one.  This prevents words from merging when PDF
    spans don't carry trailing/leading space characters."""
    result = ""
    for part in parts:
        if not result:
            result = part
        elif result.endswith((" ", "\t")) or part.startswith((" ", "\t")):
            result += part
        else:
            result += " " + part
    return result


def _join_line_texts(line_texts: list[str]) -> str:
    """Join the assembled lines of a block, handling end-of-line hyphens.

    If a line ends with '-' (soft hyphen break), the next line is appended
    directly so that 'hyphen-' + 'ation' becomes 'hyphen-ation' rather than
    'hyphen- ation'.  For all other line joins a space is ensured.
    """
    result = ""
    for line in line_texts:
        if not result:
            result = line
        elif result.endswith("-"):
            # Preserve the hyphen and join without an extra space.
            result = result + line
        elif result.endswith((" ", "\t")) or line.startswith((" ", "\t")):
            result += line
        else:
            result += " " + line
    return result


def extract_text_without_footnotes(page) -> str:
    """Extract text from a PDF page, filtering out footnotes.

    Uses font-size and position heuristics:
    1. Find the dominant (body) font size by character count
    2. Skip spans that are footnote references (small + short) or
       footnote text (small font in the bottom ~18% of the page)
    """
    page_height = page.rect.height
    page_dict = page.get_text("dict")

    # Pass 1: collect font sizes weighted by character count
    font_size_counts: dict[float, int] = {}
    for block in page_dict["blocks"]:
        if block["type"] != 0:  # skip image blocks
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                size = round(span["size"], 1)
                font_size_counts[size] = (
                    font_size_counts.get(size, 0) + len(span["text"].strip())
                )

    if not font_size_counts:
        return page.get_text("text")  # fallback

    body_font_size = max(font_size_counts, key=font_size_counts.get)
    footnote_threshold = body_font_size - 1.0
    bottom_zone = page_height * 0.82

    # Pass 2: collect text, filtering footnotes
    result_lines: list[str] = []
    for block in page_dict["blocks"]:
        if block["type"] != 0:
            continue
        block_mid_y = (block["bbox"][1] + block["bbox"][3]) / 2

        line_texts: list[str] = []
        for line in block["lines"]:
            span_texts: list[str] = []
            for span in line["spans"]:
                span_size = round(span["size"], 1)
                span_text = span["text"]

                # Skip small superscript footnote reference numbers
                if span_size < footnote_threshold and len(span_text.strip()) <= 3:
                    continue
                # Skip footnote text at bottom of page
                if block_mid_y > bottom_zone and span_size < body_font_size - 0.5:
                    continue

                span_texts.append(span_text)

            if span_texts:
                line_texts.append(_smart_join_spans(span_texts))

        if line_texts:
            result_lines.append(_join_line_texts(line_texts))

    return "\n\n".join(result_lines)


def split_words(text: str) -> list[str]:
    """Split text into words, inserting a __PARA__ sentinel at paragraph boundaries."""
    # Normalise line endings and split on blank lines (paragraph breaks)
    paragraphs = re.split(r"\n\s*\n", text)
    tokens: list[str] = []
    for i, para in enumerate(paragraphs):
        words = [w for w in para.split() if w.strip()]
        if not words:
            continue
        if tokens:  # add break between paragraphs (not before the first)
            tokens.append("__PARA__")
        tokens.extend(words)
    return tokens


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    file_bytes = await file.read()
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        all_words: list[str] = []
        pages_meta: list[dict] = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Generate thumbnails: small for preview, large for zoom
            pix_sm = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
            pix_lg = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            thumb_sm = (
                "data:image/png;base64,"
                + base64.b64encode(pix_sm.tobytes("png")).decode("ascii")
            )
            thumb_lg = (
                "data:image/png;base64,"
                + base64.b64encode(pix_lg.tobytes("png")).decode("ascii")
            )

            # Record page start index (before adding separator)
            page_start = len(all_words)

            # Extract text with footnote removal
            page_text = extract_text_without_footnotes(page)
            page_words = split_words(clean_text(page_text))

            if page_words:
                # Insert paragraph separator between pages
                if all_words:
                    all_words.append("__PARA__")
                    page_start = len(all_words)
                all_words.extend(page_words)

            pages_meta.append({
                "start_index": page_start,
                "thumbnail": thumb_sm,
                "thumbnail_hires": thumb_lg,
            })

        doc.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")

    if not all_words:
        raise HTTPException(status_code=400, detail="No text found in PDF.")

    return {"words": all_words, "count": len(all_words), "pages": pages_meta}


@app.post("/api/upload-text")
async def upload_text(body: TextInput):
    words = split_words(clean_text(body.text))
    if not words:
        raise HTTPException(status_code=400, detail="No text provided.")
    return {"words": words, "count": len(words)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
