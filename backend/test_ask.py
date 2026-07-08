import jwt
import time
import os
from dotenv import load_dotenv
import requests
import time

load_dotenv(".env")
secret = os.environ.get("SUPABASE_JWT_SECRET")

payload = {
    "sub": "0070d805-df99-48ec-9a4d-ea651c060cb2",
    "email": "tharun@gmail.com",
    "role": "authenticated",
    "user_metadata": {
        "role": "student",
        "name": "tharun"
    },
    "exp": int(time.time()) + 3600
}

token = jwt.encode(payload, secret, algorithm="HS256")
headers = {"Authorization": f"Bearer {token}"}

req_data = {
    "course_id": 3,
    "question": "explain about worldwar1",
    "session_id": "session-123456"
}

start = time.time()
try:
    print("Sending request...")
    res = requests.post("http://localhost:8000/api/v1/student/ask", json=req_data, headers=headers)
    print("Status:", res.status_code)
    print("Response:", res.text)
except Exception as e:
    print("Error:", e)
print("Time taken:", time.time() - start)
