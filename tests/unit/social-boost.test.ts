import { describe, expect, it } from 'vitest';
import { candidates, DEFAULT_BOOST_CONFIG, type Post } from '../../worker/services/social-boost';

const H = 3600_000;
const T = Date.parse('2026-11-25T12:00:00Z');
const post = (platform: Post['platform'], id: string, agoH: number): Post => ({ platform, id, permalink: `https://x/${id}`, posted_at: T - agoH * H });

describe('social boost candidates', () => {
  const armed = { ...DEFAULT_BOOST_CONFIG, enabled: true, armed_at: T - 2 * H };

  it('never orders anything before the switch is armed', () => {
    expect(candidates([post('facebook', 'a', 0)], { ...armed, armed_at: null }, new Set(), T)).toEqual([]);
  });

  it('ignores posts published before it was switched on', () => {
    const r = candidates([post('facebook', 'old', 3), post('facebook', 'new', 1)], armed, new Set(), T);
    expect(r.map((p) => p.id)).toEqual(['new']);
  });

  it('ignores posts older than the age limit even if armed long ago', () => {
    const r = candidates([post('instagram', 'a', 50), post('instagram', 'b', 10)], { ...armed, armed_at: T - 100 * H }, new Set(), T);
    expect(r.map((p) => p.id)).toEqual(['b']);
  });

  it('skips posts already handled and platforms switched off', () => {
    const cfg = { ...armed, instagram: { ...armed.instagram, enabled: false } };
    const r = candidates([post('facebook', 'a', 1), post('facebook', 'b', 0.5), post('instagram', 'c', 0.5)], cfg, new Set(['facebook:a']), T);
    expect(r.map((p) => p.id)).toEqual(['b']);
  });

  it('keeps the same post id apart per platform and orders oldest first', () => {
    const r = candidates([post('instagram', 'x', 0.2), post('facebook', 'x', 0.5)], armed, new Set(['instagram:y']), T);
    expect(r.map((p) => `${p.platform}:${p.id}`)).toEqual(['facebook:x', 'instagram:x']);
  });
});
