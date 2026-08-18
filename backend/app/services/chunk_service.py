DEFAULT_CHUNK_SIZE = 800
DEFAULT_CHUNK_OVERLAP = 100


def split_text_into_chunks(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")
    if chunk_overlap < 0:
        raise ValueError("chunk_overlap must be greater than or equal to 0")
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    content = text.strip()
    if not content:
        return []

    chunks: list[str] = []
    start = 0
    text_length = len(content)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunk = content[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end == text_length:
            break

        next_start = end - chunk_overlap
        if next_start <= start:
            raise RuntimeError("chunking did not advance")
        start = next_start

    return chunks
