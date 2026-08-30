/**
 * FR-42 export from the device (ADR-0014 §7): fetch the `export-data` document under the user's
 * session (EU region pinned), write it to the app's cache directory and hand it to the OS share
 * sheet (Files, AirDrop, mail — the user's choice). Nothing is uploaded anywhere by Hourwell.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { track } from '../observability/analytics';
import { invokeFunction } from '../sync/invoke';

export type ExportResult =
  | { ok: true; fileUri: string; tables: number }
  | { ok: false; code: 'no_session' | 'offline' | 'failed' | 'share_unavailable' };

interface ExportDocument {
  format: string;
  exported_at: string;
  counts: Record<string, number>;
  truncated: string[];
}

export interface ExportDeps {
  fetchDocument(): Promise<
    { kind: 'ok'; data: ExportDocument } | { kind: 'no-session' | 'offline' | 'failed' | 'http' }
  >;
  writeFile(name: string, json: string): string;
  canShare(): Promise<boolean>;
  share(uri: string): Promise<void>;
}

export function exportFileName(exportedAt: string): string {
  return `hourwell-export-${exportedAt.slice(0, 10)}.json`;
}

export async function exportData(deps: ExportDeps): Promise<ExportResult> {
  const res = await deps.fetchDocument();
  if (res.kind !== 'ok') {
    return {
      ok: false,
      code:
        res.kind === 'no-session' ? 'no_session' : res.kind === 'offline' ? 'offline' : 'failed',
    };
  }
  if (res.data.format !== 'hourwell-export') return { ok: false, code: 'failed' };
  const uri = deps.writeFile(
    exportFileName(res.data.exported_at),
    JSON.stringify(res.data, null, 2),
  );
  const tables = Object.keys(res.data.counts).length;
  track('data_exported', { tables, truncated: res.data.truncated.length > 0 });
  if (!(await deps.canShare())) return { ok: false, code: 'share_unavailable' };
  await deps.share(uri);
  return { ok: true, fileUri: uri, tables };
}

export const appExportDeps: ExportDeps = {
  fetchDocument: async () => {
    const r = await invokeFunction<ExportDocument>('export-data', {});
    return r.kind === 'ok' ? { kind: 'ok', data: r.data } : { kind: r.kind };
  },
  writeFile: (name, json) => {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(json);
    return file.uri;
  },
  canShare: () => Sharing.isAvailableAsync(),
  share: (uri) => Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json' }),
};

export function exportDataAction(): Promise<ExportResult> {
  return exportData(appExportDeps);
}
