import time
from app.rag.query import ask_with_rag
from app.rag.embeddings import get_vector_store
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")

print("Testing vector store retrieval...")
start = time.time()
store = get_vector_store()
retriever = store.as_retriever(search_kwargs={"k": 2})
docs = retriever.invoke("explain about worldwar1")
print(f"Retrieved {len(docs)} docs in {time.time() - start:.2f}s")

print("Testing ask_with_rag...")
start = time.time()
res = ask_with_rag("explain about worldwar1", 3)
print(f"RAG result length: {len(res.get('answer', ''))} in {time.time() - start:.2f}s")
