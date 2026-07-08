"""
security.py — Supabase JWT verification.

FastAPI never generates tokens. It only verifies JWTs issued by Supabase Auth.
The JWT secret is the HS256 secret found at:
  Supabase Dashboard → Project Settings → API → JWT Secret
"""
import logging

from jose import JWTError, jwt

from app.common.config import settings

logger = logging.getLogger("ai-education-api.security")


from supabase import create_client, Client

# Initialize a supabase client to verify tokens against the API natively (supports ES256/RS256)
supabase: Client = create_client(settings.supabase_url, settings.supabase_anon_key)

import time
import threading
from typing import Dict, Tuple

# Cache API results for 5 minutes (300 seconds) to avoid Supabase rate limits on /auth/v1/user
# Stores: token -> (payload, expires_at_timestamp)
token_cache: Dict[str, Tuple[dict, float]] = {}
cache_lock = threading.Lock()

def verify_supabase_jwt(token: str) -> dict:
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise ValueError("SUPABASE_URL or SUPABASE_ANON_KEY is not configured.")

    with cache_lock:
        # Fast path: Return cached payload if available and not expired
        cached = token_cache.get(token)
        if cached:
            payload, expires_at = cached
            if time.time() < expires_at:
                return payload
            else:
                del token_cache[token]
                
        # Cleanup cache occasionally to prevent memory leak
        if len(token_cache) > 1000:
            now = time.time()
            expired_keys = [k for k, v in token_cache.items() if v[1] < now]
            for k in expired_keys:
                del token_cache[k]
            if len(token_cache) > 1000:
                token_cache.clear()

        try:
            user_response = supabase.auth.get_user(token)
            if not user_response or not user_response.user:
                raise ValueError("Invalid user token")
            
            user = user_response.user
            payload = {
                "sub": user.id,
                "email": user.email,
                "user_metadata": user.user_metadata or {},
                "app_metadata": user.app_metadata or {},
                "role": user.role,
            }
            
            # Cache the successful API validation for 5 minutes
            token_cache[token] = (payload, time.time() + 300)
            return payload
        except Exception as exc:
            api_error = exc
        
        logger.debug(f"JWT verification failed via API. Token received: '{token}' Error: {api_error}")
        
        with open('auth_error.log', 'a') as f:
            f.write(f"API Validation Error: {type(api_error).__name__}: {str(api_error)}\n")
            
        if settings.supabase_jwt_secret:
            try:
                # Supabase JWT secrets are base64 encoded
                import base64
                
                # Add padding if necessary
                secret = settings.supabase_jwt_secret
                if len(secret) % 4 != 0:
                    secret += '=' * (4 - len(secret) % 4)
                    
                # Decode base64 URL-safe or standard
                try:
                    decoded_secret = base64.urlsafe_b64decode(secret)
                except Exception:
                    decoded_secret = base64.b64decode(secret)

                decoded = jwt.decode(
                    token,
                    key=decoded_secret,
                    algorithms=["HS256"],
                    options={"verify_aud": False, "leeway": 86400}  # 24hr leeway for clock skew
                )
                return decoded
            except Exception as decode_exc:
                import traceback
                with open('auth_error.log', 'a') as f:
                    f.write(f"JWT Decode Error: {type(decode_exc).__name__}: {str(decode_exc)}\n")
                    f.write(f"Token: {token[:30]}...\n")
                raise ValueError(f"Invalid or expired token: {decode_exc}") from exc
                
        raise ValueError("Invalid or expired token") from exc
