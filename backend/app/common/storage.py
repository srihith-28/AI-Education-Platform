"""
common/storage.py — Supabase Storage service abstraction.

All file operations go through this module. Routes never write to the local
filesystem; everything is stored in the Supabase Storage bucket configured via
SUPABASE_STORAGE_BUCKET.

Usage:
    storage = get_storage()
    path = storage.upload("courses/CS101/lecture1.pdf", file_bytes, "application/pdf")
    url  = storage.get_signed_url(path)
    data = storage.download(path)
    storage.delete(path)
"""
import logging
import os
import tempfile
from pathlib import Path

from supabase import Client, create_client

from app.common.config import settings

logger = logging.getLogger("ai-education-api.storage")

_client: Client | None = None


def _get_supabase_client() -> Client:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for file storage."
            )
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


class StorageService:
    """Thin wrapper over Supabase Storage for course material management."""

    def __init__(self) -> None:
        self._bucket = settings.supabase_storage_bucket

    def upload(self, object_path: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        """Upload bytes to Supabase Storage.

        Args:
            object_path: e.g. "courses/CS101/uuid.pdf"
            content: raw file bytes
            content_type: MIME type

        Returns:
            object_path (the stable storage key to persist in the DB)
        """
        client = _get_supabase_client()
        try:
            client.storage.from_(self._bucket).upload(
                path=object_path,
                file=content,
                file_options={"content-type": content_type, "upsert": "true"},
            )
            logger.info("Uploaded file to Supabase Storage: %s", object_path)
            return object_path
        except Exception as exc:
            logger.exception("Failed to upload %s to Supabase Storage", object_path)
            raise RuntimeError(f"File upload failed: {exc}") from exc

    def download(self, object_path: str) -> bytes:
        """Download file bytes from Supabase Storage."""
        client = _get_supabase_client()
        try:
            return client.storage.from_(self._bucket).download(object_path)
        except Exception as exc:
            logger.exception("Failed to download %s from Supabase Storage", object_path)
            raise RuntimeError(f"File download failed: {exc}") from exc

    def delete(self, object_path: str) -> None:
        """Delete a single file from Supabase Storage."""
        client = _get_supabase_client()
        try:
            client.storage.from_(self._bucket).remove([object_path])
            logger.info("Deleted file from Supabase Storage: %s", object_path)
        except Exception as exc:
            logger.warning("Failed to delete %s from Supabase Storage: %s", object_path, exc)

    def delete_folder(self, prefix: str) -> None:
        """Delete all files under a folder prefix (e.g. 'courses/CS101/')."""
        client = _get_supabase_client()
        try:
            files = client.storage.from_(self._bucket).list(prefix)
            if files:
                paths = [f"{prefix}/{f['name']}" for f in files if f.get("name")]
                if paths:
                    client.storage.from_(self._bucket).remove(paths)
                    logger.info("Deleted %d files under prefix %s", len(paths), prefix)
        except Exception as exc:
            logger.warning("Failed to delete folder %s: %s", prefix, exc)

    def get_signed_url(self, object_path: str, expires_in: int = 3600) -> str:
        """Get a time-limited signed URL for direct client download.

        Args:
            object_path: storage object key
            expires_in: seconds until expiry (default: 1 hour)

        Returns:
            signed HTTPS URL string
        """
        client = _get_supabase_client()
        try:
            result = client.storage.from_(self._bucket).create_signed_url(object_path, expires_in)
            return result.get("signedURL") or result.get("signed_url") or ""
        except Exception as exc:
            logger.exception("Failed to create signed URL for %s", object_path)
            raise RuntimeError(f"Could not generate download URL: {exc}") from exc

    def download_to_temp(self, object_path: str) -> str:
        """Download a file to a temporary local path for text extraction.

        The caller is responsible for deleting the temp file when done.

        Returns:
            Absolute local filesystem path to the temporary file.
        """
        content = self.download(object_path)
        suffix = Path(object_path).suffix
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            os.write(tmp_fd, content)
        finally:
            os.close(tmp_fd)
        logger.debug("Downloaded %s to temp file %s", object_path, tmp_path)
        return tmp_path


def get_storage() -> StorageService:
    """Dependency / factory for StorageService."""
    return StorageService()
