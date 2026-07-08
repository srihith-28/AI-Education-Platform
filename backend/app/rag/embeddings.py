"""
rag/embeddings.py — Qdrant Cloud + Gemini text-embedding-004.

Replaces ChromaDB + Ollama nomic-embed-text.
All chunking, metadata structure, and retrieval logic is preserved unchanged.
Only the storage and embedding layers are swapped.
"""
import logging

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams

from app.common.config import settings

logger = logging.getLogger("ai-education-api.rag")

# Module-level singletons (created once per process)
_qdrant_client: QdrantClient | None = None
_vector_store: QdrantVectorStore | None = None


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    """Return Gemini text-embedding-004 embeddings (1536-dim)."""
    return GoogleGenerativeAIEmbeddings(
        model=settings.gemini_embed_model,
        google_api_key=settings.gemini_api_key,
    )


def _get_qdrant_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        kwargs: dict = {"url": settings.qdrant_url}
        if settings.qdrant_api_key:
            kwargs["api_key"] = settings.qdrant_api_key
        _qdrant_client = QdrantClient(**kwargs)
        _ensure_collection(_qdrant_client)
    return _qdrant_client


def _ensure_collection(client: QdrantClient) -> None:
    """Create the Qdrant collection if it doesn't exist yet."""
    collection = settings.qdrant_collection
    existing = [c.name for c in client.get_collections().collections]
    if collection not in existing:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(
                size=3072,          # gemini-embedding-2 dimension
                distance=Distance.COSINE,
            ),
        )
        client.create_payload_index(
            collection_name=collection,
            field_name="metadata.material_id",
            field_schema="integer",
        )
        client.create_payload_index(
            collection_name=collection,
            field_name="metadata.course_id",
            field_schema="integer",
        )
        logger.info("Created Qdrant collection: %s", collection)


def get_vector_store() -> QdrantVectorStore:
    """Return (or create) the Qdrant vector store singleton."""
    global _vector_store
    if _vector_store is None:
        client = _get_qdrant_client()
        _vector_store = QdrantVectorStore(
            client=client,
            collection_name=settings.qdrant_collection,
            embedding=get_embeddings(),
        )
    return _vector_store


def delete_course_vectors(course_id: int) -> None:
    """Delete all vectors associated with a course from Qdrant."""
    try:
        client = _get_qdrant_client()
        from qdrant_client.http.models import Filter, FieldCondition, MatchValue
        client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="metadata.course_id",
                        match=MatchValue(value=course_id),
                    )
                ]
            ),
        )
        logger.info("Deleted vectors for course_id=%d from Qdrant", course_id)
    except Exception:
        logger.exception("Failed to delete vectors for course_id=%d", course_id)
