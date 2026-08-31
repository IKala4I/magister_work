"""Blocked randomization for study enrollment (File 06 §1.2: ABAB/BABA 1:1, block size 4).

Run ONCE per recruitment wave, BEFORE enrolling anyone; the printed list is the audit trail
(commit the seed, keep the list with the study records, never regenerate mid-wave). Each
enrollee takes the next free row in order of enrollment; the operator passes that row's
sequence to `enroll_participant` (docs/study/enrollment-checklist.md).

Usage: randomize_sequences.py --n 44 --seed <wave-seed>
"""

from __future__ import annotations

import argparse

import numpy as np

BLOCK = ("ABAB", "ABAB", "BABA", "BABA")  # 1:1 within every block of 4 (File 06 §1.2)


def sequences(n: int, seed: int) -> list[str]:
    rng = np.random.default_rng(seed)
    out: list[str] = []
    while len(out) < n:
        block = list(BLOCK)
        rng.shuffle(block)  # type: ignore[arg-type]
        out.extend(block)
    return out[:n]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, required=True, help="slots to draw (recruit target)")
    ap.add_argument("--seed", type=int, required=True, help="wave seed — record it")
    args = ap.parse_args()
    if args.n % 4 != 0:
        print(f"note: n={args.n} is not a multiple of the block size 4; the tail block is cut")
    for i, seq in enumerate(sequences(args.n, args.seed), start=1):
        print(f"{i:03d}  {seq}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
