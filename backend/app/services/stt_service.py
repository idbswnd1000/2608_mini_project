from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import UploadFile
from openai import OpenAI

from app.core.config import settings


async def transcribe_audio_upload(audio: UploadFile) -> str:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    suffix = Path(audio.filename or "lecture-audio.webm").suffix or ".webm"
    content = await audio.read()

    with NamedTemporaryFile(suffix=suffix, delete=True) as temp_file:
        temp_file.write(content)
        temp_file.flush()
        temp_file.seek(0)
        client = OpenAI(api_key=settings.openai_api_key)
        result = client.audio.transcriptions.create(
            model=settings.openai_stt_model,
            file=temp_file,
            language="ko",
        )

    return str(result.text).strip()
