// Price matcher for orders imported from the cashier sheet: turns a received amount into the plan(s) whose prices
// add up closest to it. Pure and allocation-light so a whole day of transactions fits in the Worker CPU budget.
//
// Rules (owner decisions, Oct 2026):
//   - always match (never skip), using 1–3 plans; the same plan may repeat;
//   - prefer fewer items: a combination with more items is used only when it is closer by more than the tolerance
//     (1% of the amount, at least 5 EGP), because most transactions are a single product;
//   - among plans with the same price, the pick is spread deterministically by the transaction key so imported sales
//     are not all attributed to one product.

export type PricedPlan = { id: string; price: number }; // price in piastres
export type MatchItem = { plan_id: string; qty: number; unit: number };
export type Match = { items: MatchItem[]; total: number; diff: number };

export const MAX_ITEMS = 3;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Index of the value in a sorted array closest to `target` (by `key`). */
function nearest(arr: ArrayLike<number>, target: number, key: (v: number) => number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) < target) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(key(arr[lo - 1]) - target) <= Math.abs(key(arr[lo]) - target)) return lo - 1;
  return lo;
}

export function tolerance(amount: number): number {
  return Math.max(Math.round(amount * 0.01), 500);
}

export function buildMatcher(plans: PricedPlan[]) {
  const byPrice = new Map<number, string[]>();
  for (const p of plans) {
    if (!Number.isInteger(p.price) || p.price <= 0) continue;
    const list = byPrice.get(p.price);
    if (list) list.push(p.id); else byPrice.set(p.price, [p.id]);
  }
  for (const list of byPrice.values()) list.sort();
  const prices = [...byPrice.keys()].sort((a, b) => a - b);
  const n = prices.length;
  // All pair sums, packed as sum * M + (i * n + j) in one Float64Array so a native numeric sort orders them by sum.
  const M = Math.max(n * n, 1);
  const pairs = new Float64Array((n * (n + 1)) / 2);
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) pairs[k++] = (prices[i] + prices[j]) * M + (i * n + j);
  pairs.sort();
  const pairSum = (v: number) => Math.floor(v / M);
  const pairIdx = (v: number) => { const r = v - pairSum(v) * M; return [Math.floor(r / n), r % n]; };
  const id = (v: number) => v;

  function match(amount: number, key = ''): Match | null {
    if (!n || !Number.isFinite(amount) || amount <= 0) return null;
    const i1 = nearest(prices, amount, id);
    const c1 = { idx: [i1], diff: Math.abs(prices[i1] - amount) };
    const p2 = pairs[nearest(pairs, amount, pairSum)];
    const c2 = { idx: pairIdx(p2), diff: Math.abs(pairSum(p2) - amount) };
    let c3 = { idx: [] as number[], diff: Infinity };
    for (let i = 0; i < n; i++) {
      const p = pairs[nearest(pairs, amount - prices[i], pairSum)];
      const d = Math.abs(prices[i] + pairSum(p) - amount);
      if (d < c3.diff) { c3 = { idx: [i, ...pairIdx(p)], diff: d }; if (d === 0) break; }
    }
    const tol = tolerance(amount);
    let best = c1;
    if (c2.diff < best.diff - tol) best = c2;
    if (c3.diff < best.diff - tol) best = c3;

    const items: MatchItem[] = [];
    best.idx.forEach((pi, pos) => {
      const ids = byPrice.get(prices[pi])!;
      const planId = ids[fnv1a(`${key}:${pos}`) % ids.length];
      const same = items.find((it) => it.plan_id === planId);
      if (same) same.qty++; else items.push({ plan_id: planId, qty: 1, unit: prices[pi] });
    });
    const total = items.reduce((s, it) => s + it.unit * it.qty, 0);
    return { items, total, diff: total - amount };
  }

  return { match, priceCount: n };
}
