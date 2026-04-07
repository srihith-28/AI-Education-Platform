from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings

from app.common.config import settings


def get_embeddings() -> OllamaEmbeddings:
    return OllamaEmbeddings(model=settings.ollama_embed_model, base_url=settings.ollama_base_url)


def get_vector_store() -> Chroma:
    return Chroma(
        collection_name="course_materials",
        embedding_function=get_embeddings(),
        persist_directory=settings.chroma_persist_dir,
    )


def delete_course_vectors(course_id: int) -> None:
    try:
        store = get_vector_store()
        store.delete(where={"course_id": course_id})
    except Exception:
        return
