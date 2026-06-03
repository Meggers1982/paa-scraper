"""
Vercel serverless function — scrapes PAA for a single keyword.
Called once per keyword from the frontend.
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import time
from collections import deque

from serpapi import GoogleSearch


def fetch_paa(query, api_key, location, hl="en", gl="us"):
    params = {
        "engine": "google",
        "q": query,
        "location": location,
        "hl": hl,
        "gl": gl,
        "api_key": api_key,
    }
    try:
        results = GoogleSearch(params).get_dict()
        return results.get("related_questions", [])
    except Exception as e:
        return []


def scrape_paa_deep(seed, api_key, location, max_depth, max_questions, delay):
    rows = []
    seen = set()
    queue = deque()
    queue.append((seed, 0, None))

    while queue and len(rows) < max_questions:
        query, depth, parent = queue.popleft()
        if depth > max_depth:
            continue

        paa_blocks = fetch_paa(query, api_key, location)
        time.sleep(delay)

        for item in paa_blocks:
            if len(rows) >= max_questions:
                break
            question = item.get("question", "").strip()
            if not question or question in seen:
                continue
            seen.add(question)
            rows.append({
                "seed_keyword": seed,
                "depth": depth,
                "parent_question": parent or seed,
                "paa_question": question,
                "snippet": item.get("snippet", ""),
                "source_title": item.get("title", ""),
                "source_link": item.get("link", ""),
                "displayed_link": item.get("displayed_link", ""),
                "date": item.get("date", ""),
            })
            if depth < max_depth:
                queue.append((question, depth + 1, question))

    return rows


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        def q(key, default=""):
            return qs.get(key, [default])[0]

        api_key = q("api_key")
        keyword = q("keyword")
        location = q("location", "United States")
        max_depth = int(q("max_depth", "3"))
        max_questions = int(q("max_questions", "50"))
        delay = float(q("delay", "1.5"))

        if not api_key or not keyword:
            self._respond(400, {"error": "api_key and keyword are required"})
            return

        try:
            rows = scrape_paa_deep(keyword, api_key, location, max_depth, max_questions, delay)
            self._respond(200, {"rows": rows, "count": len(rows)})
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
