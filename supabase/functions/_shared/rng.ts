/**
 * Seedable PRNG for the matched ε-randomization (H1). The service draws with NumPy's PCG64;
 * exact stream equality across languages is NOT required — only the same *distribution*
 * (Bernoulli(ε), uniform task, uniform bucket) — so this is sfc32 seeded through splitmix32,
 * with rejection-sampled integers so `int(n)` is exactly uniform (no modulo bias).
 * The seed is logged in plan telemetry (`rng_seed`) for reproducibility, mirroring the service.
 */

export interface Rng {
  /** Uniform 32-bit unsigned integer. */
  nextU32(): number;
  /** Uniform double in [0, 1) with 53 bits of resolution. */
  random(): number;
  /** Exactly uniform integer in [0, n). */
  int(n: number): number;
}

/** 53-bit safe-integer seed from the platform CSPRNG. */
export function randomSeed(): number {
  const words = new Uint32Array(2);
  crypto.getRandomValues(words);
  return (words[0] & 0x1fffff) * 0x100000000 + words[1];
}

function splitmix32(state: { s: number }): number {
  state.s = (state.s + 0x9e3779b9) | 0;
  let z = state.s;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

export function seededRng(seed: number): Rng {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError(`seed must be a non-negative safe integer, got ${seed}`);
  }
  const lo = seed % 0x100000000;
  const hi = Math.floor(seed / 0x100000000);
  const mix = { s: (lo ^ Math.imul(hi, 0x85ebca6b)) | 0 };
  let a = splitmix32(mix);
  let b = splitmix32(mix);
  let c = splitmix32(mix);
  let d = splitmix32(mix);

  const nextU32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) nextU32(); // warm-up, as in the reference implementation

  const random = (): number => {
    const upper = nextU32() >>> 5; // 27 bits
    const lower = nextU32() >>> 6; // 26 bits
    return (upper * 0x4000000 + lower) / 0x20000000000000; // / 2^53
  };

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`int(n) needs n ≥ 1, got ${n}`);
    if (n > 0xffffffff) throw new RangeError('int(n) supports n ≤ 2^32');
    const limit = 0x100000000 - (0x100000000 % n); // largest multiple of n below 2^32
    let u = nextU32();
    while (u >= limit) u = nextU32();
    return u % n;
  };

  return { nextU32, random, int };
}
