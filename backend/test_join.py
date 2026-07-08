import jwt
import time
import os
from dotenv import load_dotenv
import requests

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
print("Generated token:", token)

headers = {"Authorization": f"Bearer {token}"}
res = requests.post("http://localhost:8000/api/v1/student/join-course", json={"class_code": "I2SYVS"}, headers=headers)
print("Status:", res.status_code)
print("Response:", res.text)
