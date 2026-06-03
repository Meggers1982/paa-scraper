"""
Vercel serverless function — generates CSV or Excel download from posted rows.
POST /api/download?format=csv|excel
Body: JSON array of row objects
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import io

import pandas as pd


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        fmt = qs.get("format", ["csv"])[0]

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        rows = json.loads(body)
        df = pd.DataFrame(rows)

        if fmt == "excel":
            buf = io.BytesIO()
            df_unique = df.drop_duplicates(subset=["paa_question"])
            with pd.ExcelWriter(buf, engine="openpyxl") as writer:
                df.to_excel(writer, sheet_name="All PAA", index=False)
                df_unique.to_excel(writer, sheet_name="Unique Questions", index=False)
                for kw in df["seed_keyword"].unique():
                    df[df["seed_keyword"] == kw].to_excel(
                        writer, sheet_name=kw[:31], index=False
                    )
            data = buf.getvalue()
            mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "paa_results.xlsx"
        else:
            buf = io.StringIO()
            df.to_csv(buf, index=False)
            data = buf.getvalue().encode()
            mime = "text/csv"
            filename = "paa_results.csv"

        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data if isinstance(data, bytes) else data.encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *args):
        pass
