# Test report: slow-burn scam detection (18 October 2026)

Branch `test-prototype`, backend revision `stallwart-api-00008-5mj`, site https://stallwart.web.app.
All benchmarks are **synthetic** (LLM-generated); none measures real-world accuracy.

## What changed

- Five new red flags for scams that persuade rather than demand:
  - decisive on their own: `guaranteed_returns`, `romance_money_request`;
  - warning signs (two make a scam): `solicits_money_now`, `evades_credentials`, `unexpected_windfall`.
- `asks_full_identifier` now covers any card digits; `partial_identifier_only` counts only when the caller reads out digits it already has.
- Ramesh asks for SEBI/RBI registration, a charity's 80G certificate or the registered office when an investment, charity, refund or online friendship turns to money.

## Method

- The 100 ICFD cross-domain calls read while designing the flags are frozen in `eval/fixtures/icfd_crossdomain_dev_ids.json` and never scored.
- Before/after was measured once on 100 unseen cross-domain calls (20 per type, seed 11) plus all 62 ICFD non-fraud calls.
- The full ICFD run (3 runs), three extra benchmarks, 40 genuine-vs-scam pairs and the 44-prompt red-team were re-run on the new code.

## 1. Held-out slow-burn scams (before vs after)

| | Before | After |
|---|---|---|
| Fraud calls caught (100 unseen cross-domain calls) | 60.0% | **75.8%** |
| Crypto and NFT | 14/20 | 17/19 |
| Romance | 7/20 | 8/20 |
| Fake charity | 10/20 | 17/20 |
| Ponzi, MLM and investment | 15/20 | 18/20 |
| Tax and social security | 14/20 | 15/20 |
| ICFD non-fraud calls flagged as scam | 8/62 | 7/62 |

Of the 24 calls still missed, a separate Gemini check found the caller honest in 14 (usually a bank warning a customer about someone else's scam). Stallwart judges only the caller, so it is right not to flag these. Counting only calls where the caller is the fraudster, recall is **88.2%**. This is a second opinion, not a relabelling; every other number uses ICFD's labels unchanged.

## 2. ICFD-31k, full re-run (3 runs)

Every non-fraud call (62) and 300 fraud calls; the keyword baseline runs on every call.

| Split | Recall | Specificity | Precision | F1 | Previous F1 (16 Oct) |
|---|---|---|---|---|---|
| Test + cross-domain | 85.9% | 87.7% | 97.2% | **91.2%** | 84.3% |
| Test | 91.1% | 69.7% | 96.4% | **93.7%** | 91.9% |
| Cross-domain (unseen types) | 75.3% | 98.2% | 99.1% | **85.6%** | 64.9% |
| Keyword baseline (all calls) | 60.3% | 74.2% | 99.5% | 75.1% | |

Published ICFD baselines on the test split: zero-shot Gemma-2 F1 35.8%; fine-tuned RoBERTa F1 99.6%. Stallwart is not trained on ICFD.

**Streaming** (re-checked after each caller turn):

- Fraud calls flagged: 23/30, at a median 45.0 s.
- ICFD's own first fraud label: 47.5 s.
- Non-fraud calls ever flagged: 10/62 (previously 7/62).

## 3. Other public benchmarks

| Benchmark | Recall | Specificity | F1 | Previous F1 |
|---|---|---|---|---|
| BothBosu scam-dialogue (test split, English calls) | 97.5% | 100.0% | **98.7%** | 92.3% |
| BothBosu multi-agent-scam-conversation (test split, English calls) | 95.5% | 100.0% | **97.7%** | 93.6% |
| Indian scam SMS, audited (English, Hindi, Hinglish messages) | 83.0% | 99.3% | **90.4%** | 89.1% |

Refund scams caught on the BothBosu sets:

- scam-dialogue: 38/40 (previously 24/40)
- multi-agent: 36/40 (previously 27/40)

## 4. Regression checks

| Check | Result |
|---|---|
| 40 genuine-vs-scam pairs | 0.0% genuine flagged, 100.0% scams caught, 0.0% streaming false alarms |
| Classifier cases (14 ordinary, 11 scam) | 0 false alarms, 0 missed (1 request failed) |
| Persona red-team | 44/44 |
| Unit tests | 201 passed |
| `scripts/verify_deployment.py` (live site) | 24/24 passed, plus the new slow-burn label check |

## Known weaknesses

- Romance scams barely moved (7/20 to 8/20), mostly because many have an honest caller.
- New false alarms:
  - one SMS ("Congrats! You've been selected for the FreeKaaMaal contest by Paytm..."), labelled safe but never checked by a human;
  - one gold-investment pitch in streaming ("always appreciates in value");
  - streaming false alarms on ICFD non-fraud calls rose from 7 to 10 of 62.

## Reproduce

```
python eval/detection_eval.py --runs 3
python eval/benchmarks_eval.py
python eval/hard_negative_eval.py --runs 1 --methods current
python eval/redteam.py
python eval/caller_audit.py heldout_after.json
python scripts/verify_deployment.py
```
