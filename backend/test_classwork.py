import jwt
import time
import os
from dotenv import load_dotenv
import requests

load_dotenv(".env")
secret = os.environ.get("SUPABASE_JWT_SECRET")

# Use teacher's supabase uid
payload = {
    "sub": "3799f80f-e044-424d-a009-bfc409e7c7c8",
    "email": "srihithrangineni@gmail.com",
    "role": "authenticated",
    "user_metadata": {
        "role": "teacher",
        "name": "SRI"
    },
    "exp": int(time.time()) + 3600
}

token = jwt.encode(payload, secret, algorithm="HS256")
headers = {"Authorization": f"Bearer {token}"}

try:
    print("Testing GET /classwork/3")
    res = requests.get("http://localhost:8000/api/v1/classwork/3", headers=headers)
    print("Status:", res.status_code)
    print("Response:", res.text[:500])
except Exception as e:
    print("Error:", e)
