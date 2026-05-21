import json
import subprocess

API_KEY = "moltbook_sk_RSsmySMr5NAyuOG7SJbbD77LYWAlmAX5"
url = "https://www.moltbook.com/api/v1/feed?sort=new&limit=25"
cmd = ["curl", "-s", url, "-H", f"Authorization: Bearer {API_KEY}"]
result = subprocess.run(cmd, capture_output=True, text=True)
print(result.stdout)
