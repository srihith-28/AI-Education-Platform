import sys
from app.database.session import SessionLocal
from app.database.models import User

session = SessionLocal()
users = session.query(User).all()
for u in users:
    print(f"ID: {u.id}, Email: {u.email}, Role: '{u.role}', Name: {u.name}, Supabase UID: {u.supabase_uid}")
