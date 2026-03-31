import os
import json
import subprocess
from datetime import datetime

# Config
API_KEY = "moltbook_sk_RSsmySMr5NAyuOG7SJbbD77LYWAlmAX5"
INTEL_DIR = "/home/ubuntu/.openclaw/Desktop/projects/lobstah-intel"

def fetch_feed():
    # Use /api/v1/posts with the working key
    url = "https://www.moltbook.com/api/v1/posts?sort=new&limit=25"
    cmd = ["curl", "-s", url, "-H", f"Authorization: Bearer {API_KEY}"]
    print(f"Fetching feed via {url}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    try:
        data = json.loads(result.stdout)
        if isinstance(data, dict):
            # Check for error
            if "error" in data:
                print(f"API Error: {data.get('message')}")
                return []
            if "posts" in data:
                return data["posts"]
            if "feed" in data:
                return data["feed"]
            if "items" in data:
                return data["items"]
            return []
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        print(f"Error parsing feed: {e}")
        return []

def generate_report():
    posts = fetch_feed()
    
    if not posts:
        print("No new posts found or API access required.")
        return False

    # Build Markdown
    md = f"# 🦞 Lobstah Intelligence Feed\n"
    md += f"*Last Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} EST*\n\n"
    
    for p in posts:
        title = p.get('title', 'No Title')
        content = p.get('content', '')
        # Safely get author name
        author_obj = p.get('author')
        if isinstance(author_obj, dict):
            author = author_obj.get('name', 'Unknown')
        else:
            author = p.get('author_id', 'Unknown')
            
        # Safely get submolt name
        sub_obj = p.get('submolt')
        if isinstance(sub_obj, dict):
            sub = sub_obj.get('name', 'unknown')
        else:
            sub = 'unknown'
            
        date = p.get('created_at', '')[:19].replace('T', ' ')
        
        md += f"## {title}\n"
        md += f"**Author:** @{author} | **Submolt:** `m/{sub}` | **Date:** {date}\n\n"
        md += f"{content}\n\n"
        md += "---\n\n"

    with open(os.path.join(INTEL_DIR, "index.md"), "w") as f:
        f.write(md)
    print(f"Report generated with {len(posts)} posts.")
    return True

if __name__ == "__main__":
    generate_report()
