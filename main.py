import io
import re
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
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text("text"))
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")

    full_text = " ".join(text_parts)
    words = split_words(clean_text(full_text))

    if not words:
        raise HTTPException(status_code=400, detail="No text found in PDF.")

    return {"words": words, "count": len(words)}


@app.post("/api/upload-text")
async def upload_text(body: TextInput):
    words = split_words(clean_text(body.text))
    if not words:
        raise HTTPException(status_code=400, detail="No text provided.")
    return {"words": words, "count": len(words)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
