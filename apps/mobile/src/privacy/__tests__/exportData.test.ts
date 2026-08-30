const mockTrack = jest.fn();
jest.mock('../../observability/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('../../auth/client', () => ({ supabase: null }));

import { type ExportDeps, exportData, exportFileName } from '../exportData';

const doc = {
  format: 'hourwell-export',
  exported_at: '2026-09-05T10:00:00.000Z',
  counts: { tasks: 3, events: 40 },
  truncated: [] as string[],
};

function deps(over: Partial<ExportDeps> = {}) {
  const written: Array<{ name: string; json: string }> = [];
  const shared: string[] = [];
  const d: ExportDeps = {
    fetchDocument: () => Promise.resolve({ kind: 'ok', data: doc }),
    writeFile: (name, json) => {
      written.push({ name, json });
      return `file:///cache/${name}`;
    },
    canShare: () => Promise.resolve(true),
    share: (uri) => {
      shared.push(uri);
      return Promise.resolve();
    },
    ...over,
  };
  return { d, written, shared };
}

beforeEach(() => mockTrack.mockClear());

describe('exportData (FR-42, ADR-0014 §7)', () => {
  it('writes the document to a dated file and opens the share sheet', async () => {
    const h = deps();
    const r = await exportData(h.d);
    expect(r).toEqual({
      ok: true,
      fileUri: 'file:///cache/hourwell-export-2026-09-05.json',
      tables: 2,
    });
    expect(h.written[0]!.name).toBe('hourwell-export-2026-09-05.json');
    expect(JSON.parse(h.written[0]!.json)).toEqual(doc);
    expect(h.shared).toEqual(['file:///cache/hourwell-export-2026-09-05.json']);
    expect(mockTrack).toHaveBeenCalledWith('data_exported', { tables: 2, truncated: false });
  });
  it('maps failures calmly and writes nothing', async () => {
    for (const [kind, code] of [
      ['no-session', 'no_session'],
      ['offline', 'offline'],
      ['failed', 'failed'],
      ['http', 'failed'],
    ] as const) {
      const h = deps({ fetchDocument: () => Promise.resolve({ kind }) });
      expect(await exportData(h.d)).toEqual({ ok: false, code });
      expect(h.written).toEqual([]);
    }
    const wrong = deps({
      fetchDocument: () => Promise.resolve({ kind: 'ok', data: { ...doc, format: 'other' } }),
    });
    expect(await exportData(wrong.d)).toEqual({ ok: false, code: 'failed' });
  });
  it('no share sheet → the file exists but the result says so', async () => {
    const h = deps({ canShare: () => Promise.resolve(false) });
    expect(await exportData(h.d)).toEqual({ ok: false, code: 'share_unavailable' });
    expect(h.written).toHaveLength(1);
    expect(h.shared).toEqual([]);
  });
  it('exportFileName uses the export date', () => {
    expect(exportFileName('2026-12-31T23:59:59Z')).toBe('hourwell-export-2026-12-31.json');
  });
});
