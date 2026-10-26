#!/usr/bin/env python3
"""Measure generation outcomes against a deployed SeeLearn endpoint."""
import argparse
import csv
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

TOPICS = ["racing drone", "smartphone", "DDR5 RAM module", "transistor in a CPU", "electric motor", "robotic arm", "heart pump", "jet engine", "bicycle gearbox", "solar inverter"]


def valid_spec(spec):
    if not isinstance(spec, dict) or spec.get("schemaVersion") != 1:
        return False
    components = spec.get("components")
    if not isinstance(components, list) or not 8 <= len(components) <= 30:
        return False
    ids = [c.get("id") for c in components if isinstance(c, dict)]
    if len(ids) != len(components) or len(set(ids)) != len(ids):
        return False
    return all(isinstance(c.get("parts"), list) and 1 <= len(c["parts"]) <= 6 for c in components)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("endpoint", help="Deployed Lambda Function URL")
    p.add_argument("--timeout", type=float, default=60)
    p.add_argument("--output-dir", default="eval/results")
    args = p.parse_args()
    out = Path(args.output_dir); out.mkdir(parents=True, exist_ok=True)
    rows = []
    for topic in TOPICS:
        start = time.perf_counter(); status = None; outcome = "failed"; err = ""
        req = urllib.request.Request(args.endpoint, data=json.dumps({"action":"generate", "topic":topic}).encode(), headers={"Content-Type":"application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=args.timeout) as response:
                status = response.status; payload = json.loads(response.read().decode())
            if status == 200 and valid_spec(payload.get("spec")):
                repaired = payload.get("repairAttempted")
                outcome = "needed repair" if repaired is True else "valid on first try" if repaired is False else "failed"
                if repaired is None: err = "endpoint did not report repairAttempted"
            else: err = "non-200 or invalid scene spec"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            err = str(exc)
            if isinstance(exc, urllib.error.HTTPError): status = exc.code
        rows.append({"topic":topic, "outcome":outcome, "latencyMs":round((time.perf_counter()-start)*1000, 2), "status":status, "details":err})
        print(f"{topic}: {outcome}; {rows[-1]['latencyMs']} ms" + (f"; {err}" if err else ""))
    csv_path = out / "generation.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys()); writer.writeheader(); writer.writerows(rows)
    md = ["# Generation evaluation", "", "| Topic | Outcome | Latency (ms) | HTTP status | Details |", "|---|---|---:|---:|---|"]
    md += [f"| {r['topic']} | {r['outcome']} | {r['latencyMs']} | {r['status'] if r['status'] is not None else 'N/A'} | {r['details'] or '—'} |" for r in rows]
    (out / "generation_report.md").write_text("\n".join(md)+"\n", encoding="utf-8")
    return 0


if __name__ == "__main__": raise SystemExit(main())
