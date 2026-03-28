import io
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


def split_words(text: str) -> list[str]:
    return [w for w in text.split() if w.strip()]


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
    words = split_words(full_text)

    if not words:
        raise HTTPException(status_code=400, detail="No text found in PDF.")

    return {"words": words, "count": len(words)}


@app.post("/api/upload-text")
async def upload_text(body: TextInput):
    words = split_words(body.text)
    if not words:
        raise HTTPException(status_code=400, detail="No text provided.")
    return {"words": words, "count": len(words)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
