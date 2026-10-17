"""Who is the fraudster in the ICFD calls Stallwart did not flag? A second-opinion audit of the misses.

ICFD-31k labels a conversation 'fraud' by its scenario. Stallwart judges only the CALLER (the ICFD 'Agent'), because
that is who rings the decoy. Some 'fraud' conversations have an honest caller: a bank helping a customer who is being
scammed by someone else. This script asks Gemini Flash, independently of the classifier, who is defrauding whom in
each missed call. It never changes the reported recall; it only explains the misses.

    python eval/caller_audit.py heldout_after.json --split cross_domain
"""

import argparse
import asyncio
import collections
import json
import pathlib
import sys
from typing import Literal

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from google.genai import types  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import analysis  # noqa: E402
import detection_eval as de  # noqa: E402
from clients import flash, text_client  # noqa: E402

RESULTS = pathlib.Path(__file__).resolve().parent / "results"

PROMPT = """Read this phone call between an AGENT (the person who placed or took the call on the organisation's side)
and a CUSTOMER. Answer one question: in THIS conversation, who is trying to cheat whom?
- agent: the AGENT is trying to get money, details or control from the CUSTOMER by deception or pressure.
- customer: the CUSTOMER is trying to cheat the AGENT.
- third_party: neither speaker is cheating the other; they are discussing a scam by someone who is not on the call
  (for example a bank warning a customer about a romance or investment scammer).
- nobody: no one is trying to cheat anyone.
Judge only what is said in the transcript."""


class Who(BaseModel):
    fraudster: Literal["agent", "customer", "third_party", "nobody"]
    reason: str


async def judge(row: dict, sem: asyncio.Semaphore) -> str | None:
    text = "\n".join(f"{'AGENT' if t['speaker'] == 'caller' else 'CUSTOMER'}: {t['text']}" for t in row["turns"])
    async with sem:
        try:
            response = await flash(text_client(), contents=PROMPT + "\n\nTRANSCRIPT:\n" + text, attempts=3,
                                   cfg=types.GenerateContentConfig(response_mime_type="application/json",
                                                                   response_schema=Who, thinking_config=analysis._thinking()))
            return Who.model_validate_json(response.text).fraudster
        except Exception:  # noqa: BLE001
            return None


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", help="a results file from detection_eval.py, in eval/results")
    parser.add_argument("--split", default="cross_domain")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    data = json.loads((RESULTS / args.results).read_text(encoding="utf-8"))
    preds = [p for p in data["runs"][0]["predictions"] if p["split"] == args.split and p["fraud"] and not p["error"]]
    rows = {r["id"]: r for r in de.load_rows()}
    missed = [p for p in preds if p["verdict"] != "scam"]
    sem = asyncio.Semaphore(4)
    verdicts = await asyncio.gather(*[judge(rows[p["id"]], sem) for p in missed])
    counts = collections.Counter(v or "failed" for v in verdicts)
    by_verdict = collections.Counter((p["verdict"], v or "failed") for p, v in zip(missed, verdicts))
    caught = len(preds) - len(missed)
    honest_caller = counts["third_party"] + counts["customer"] + counts["nobody"]
    summary = {
        "results_file": args.results, "split": args.split, "fraud_calls": len(preds), "flagged": caught,
        "missed": len(missed), "who_is_cheating_in_missed_calls": dict(counts),
        "by_stallwart_verdict": {f"{k[0]} / {k[1]}": n for k, n in by_verdict.items()},
        "missed_with_dishonest_caller": counts["agent"],
        "recall_on_calls_where_the_caller_is_the_fraudster":
            round(caught / (len(preds) - honest_caller), 3) if len(preds) > honest_caller else None,
        "note": "Second opinion by Gemini Flash on the missed calls only; flagged calls are assumed to have a dishonest "
                "caller. Not a relabelling of ICFD and not used for the headline numbers.",
    }
    (RESULTS / f"caller_audit_{pathlib.Path(args.results).stem}.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    de.FILES = {"test": ["test-00000-of-00002.jsonl", "test-00001-of-00002.jsonl"],
                "cross_domain": ["cross_domain-00000-of-00001.jsonl"]}
    asyncio.run(main())
