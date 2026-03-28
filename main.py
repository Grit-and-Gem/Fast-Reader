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

            # Generate thumbnail (half-size PNG → base64)
            pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
            thumb_b64 = (
                "data:image/png;base64,"
                + base64.b64encode(pix.tobytes("png")).decode("ascii")
            )

            # Record page start index (before adding separator)
            page_start = len(all_words)

            # Extract and tokenise this page's text
            page_text = page.get_text("text")
            page_words = split_words(clean_text(page_text))

            if page_words:
                # Insert paragraph separator between pages
                if all_words:
                    all_words.append("__PARA__")
                    page_start = len(all_words)
                all_words.extend(page_words)

            pages_meta.append({
                "start_index": page_start,
                "thumbnail": thumb_b64,
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
