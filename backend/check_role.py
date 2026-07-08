import sys
from app.database.session import SessionLocal
from app.database.models import User

session = SessionLocal()
u = session.query(User).filter_by(email="tharun@gmail.com").first()
print(f"Role repr: {repr(u.role)}")
