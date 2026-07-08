import sys
from app.common.config import settings
from supabase import create_client

url = settings.supabase_url
key = settings.supabase_service_role_key

supabase = create_client(url, key)
users = supabase.auth.admin.list_users()

for u in users:
    print(f"Email: {u.email}, user_metadata: {u.user_metadata}")
