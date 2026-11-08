import { describe, expect, it } from 'vitest';
import { buildMatcher, tolerance } from '../../shared/match';

const E = (egp: number) => egp * 100;
const plans = [
  { id: 'spotify', price: E(97) }, { id: 'yt', price: E(130) }, { id: 'netflix', price: E(350) },
  { id: 'gp10', price: E(550) }, { id: 'apple10', price: E(550) }, { id: 'ps', price: E(1300) }, { id: 'cc', price: E(35400) },
];

describe('price matcher', () => {
  const m = buildMatcher(plans);

  it('matches an exact single price', () => {
    const r = m.match(E(350), 't1')!;
    expect(r.items).toEqual([{ plan_id: 'netflix', qty: 1, unit: E(350) }]);
    expect(r.diff).toBe(0);
  });

  it('uses two plans when that is clearly closer', () => {
    const r = m.match(E(480), 't2')!; // 350 + 130
    expect(r.total).toBe(E(480));
    expect(r.items.map((i) => i.plan_id).sort()).toEqual(['netflix', 'yt']);
  });

  it('uses three plans when that is clearly closer, repeating a plan as qty', () => {
    const r = m.match(E(1997), 't3')!; // 1300 + 350 + 350 = 2000 (diff 3) vs pairs/singles further away
    expect(r.items.reduce((s, i) => s + i.qty, 0)).toBe(3);
    expect(Math.abs(r.diff)).toBeLessThanOrEqual(E(5));
    expect(r.items.find((i) => i.plan_id === 'netflix')?.qty).toBe(2);
  });

  it('prefers a single plan when a combination is only marginally closer', () => {
    const r = m.match(E(1290), 't4')!; // single 1300 (diff 10) vs no better combo beyond tolerance
    expect(r.items).toHaveLength(1);
    expect(r.items[0].plan_id).toBe('ps');
    expect(tolerance(E(1290))).toBe(1290);
  });

  it('always returns the nearest match, even far away from any price', () => {
    const r = m.match(E(150000), 't5')!; // far above every 3-plan total
    expect(r.items.reduce((s, i) => s + i.qty, 0)).toBe(3);
    expect(r.total).toBe(E(35400) * 3);
    const tiny = m.match(E(5), 't6')!;
    expect(tiny.items).toEqual([{ plan_id: 'spotify', qty: 1, unit: E(97) }]);
  });

  it('spreads equal-price plans deterministically by transaction key', () => {
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) picks.add(m.match(E(550), 'trx' + i)!.items[0].plan_id);
    expect([...picks].sort()).toEqual(['apple10', 'gp10']);
    expect(m.match(E(550), 'same')!.items[0].plan_id).toBe(m.match(E(550), 'same')!.items[0].plan_id);
  });

  it('handles empty catalogues and bad amounts', () => {
    expect(buildMatcher([]).match(E(100))).toBeNull();
    expect(m.match(0)).toBeNull();
    expect(m.match(Number.NaN)).toBeNull();
  });

  it('is fast enough for a day of transactions on a large catalogue', () => {
    const big = Array.from({ length: 600 }, (_, i) => ({ id: 'p' + i, price: E(97 + i * 73) }));
    const t0 = performance.now();
    const bm = buildMatcher(big);
    for (let i = 0; i < 300; i++) bm.match(E(100 + i * 331), 'k' + i);
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
