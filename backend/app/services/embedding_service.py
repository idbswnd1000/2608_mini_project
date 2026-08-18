from functools import lru_cache

from sentence_transformers import SentenceTransformer


EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIMENSION = 384


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    return SentenceTransformer(EMBEDDING_MODEL_NAME, device="cpu")


def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    if not texts:
        return []

    model = get_embedding_model()
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )

    vectors = embeddings.tolist()
    for index, vector in enumerate(vectors):
        if len(vector) != EMBEDDING_DIMENSION:
            raise ValueError(
                "Unexpected embedding dimension "
                f"for item {index}: {len(vector)}"
            )
        vectors[index] = [float(value) for value in vector]

    return vectors
