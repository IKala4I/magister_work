/**
 * Focus — the running session (FR-30: start/pause/finish/abandon with duration telemetry) and the
 * FR-31 1-tap rating after it ends (optional, ≤ 2 taps, inline — never a modal). The session row
 * lives in SQLite (survives restarts); this screen only ticks a clock. Numerals in JetBrains Mono
 * (File 02 §3.3). No animation, so reduced motion has nothing to strip (NFR-A2). The
 * focus-gradient Skia ring is a P9 item (versions.md); a plain progress bar stands in.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { currentUserId } from '../../src/auth/identity';
import { useSessionStore } from '../../src/auth/session';
import { db } from '../../src/db/client';
import {
  activeFocusSessionQuery,
  focusedMsAt,
  lastEndedSessionQuery,
  type FocusSessionRow,
} from '../../src/db/feedback';
import { activeTasksQuery } from '../../src/db/tasks';
import type { TaskRow } from '../../src/db/tasks';
import { useLiveRows } from '../../src/db/useLiveRows';
import type { LocalDb } from '../../src/db/writes';
import {
  endFocusAction,
  pauseFocusAction,
  rateSessionAction,
  resumeFocusAction,
} from '../../src/domain/blockActions';
import { t } from '../../src/i18n';
import { Button, EmptyState, GlassPanel, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

const localDb = db as unknown as LocalDb;
const SESSION_TABLES = ['focus_sessions'] as const;
const TASK_TABLES = ['tasks'] as const;

export function formatElapsed(ms: number): string {
  const total = Math.max(Math.floor(ms / 1000), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

type Energy = 1 | 2 | 3;

function RatingChips({
  labels,
  a11yPrefix,
  onPick,
}: {
  labels: readonly [string, string, string];
  a11yPrefix: string;
  onPick: (value: Energy) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {labels.map((label, i) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={`${a11yPrefix}: ${label}`}
          onPress={() => onPick((i + 1) as Energy)}
          style={({ pressed }) => [
            styles.chip,
            { backgroundColor: theme.colors.primaryContainer },
            pressed && styles.dimmed,
          ]}
        >
          <ThemedText variant="caption">{label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export default function FocusScreen() {
  const theme = useTheme();
  useSessionStore((s) => s.userId);
  const userId = currentUserId();
  const active = useLiveRows<FocusSessionRow>(
    () => activeFocusSessionQuery(localDb, userId),
    SESSION_TABLES,
    [userId],
  );
  const ended = useLiveRows<FocusSessionRow>(
    () => lastEndedSessionQuery(localDb, userId),
    SESSION_TABLES,
    [userId],
  );
  const taskRows = useLiveRows<TaskRow>(() => activeTasksQuery(localDb, userId), TASK_TABLES, [
    userId,
  ]);
  const titles = useMemo(() => new Map(taskRows.map((task) => [task.id, task.title])), [taskRows]);
  const session = active[0] ?? null;
  const now = useTick(session?.state === 'running');
  // rating state: which ended session was rated/dismissed in this screen life
  const [ratedId, setRatedId] = useState<string | null>(null);
  const [energyFor, setEnergyFor] = useState<{ id: string; energy: Energy } | null>(null);
  const last = ended[0] ?? null;
  const offerRating =
    session === null && last !== null && last.ratedEnergy === null && ratedId !== last.id;

  if (session !== null) {
    const focusedMs = focusedMsAt(session, now);
    const plannedMs = session.plannedMinutes * 60_000;
    const fraction = Math.min(focusedMs / plannedMs, 1);
    const running = session.state === 'running';
    return (
      <Screen>
        <GlassPanel solidity={1} style={styles.panel}>
          <ThemedText variant="caption" tone="secondary">
            {running ? t('focus.running') : t('focus.paused')}
          </ThemedText>
          <ThemedText variant="h2">{titles.get(session.taskId) ?? t('task.notFound')}</ThemedText>
          <ThemedText
            variant="h1"
            mono
            accessibilityLabel={t('focus.elapsed.a11y', {
              minutes: Math.floor(focusedMs / 60_000),
              planned: session.plannedMinutes,
            })}
          >
            {formatElapsed(focusedMs)}
          </ThemedText>
          <View
            style={[styles.track, { backgroundColor: theme.colors.primaryContainer }]}
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
          >
            <View
              style={[
                styles.fill,
                { width: `${fraction * 100}%`, backgroundColor: theme.colors.primary },
              ]}
            />
          </View>
          <View style={styles.row}>
            {running ? (
              <Button
                label={t('focus.pause')}
                kind="secondary"
                onPress={() => pauseFocusAction(session.id)}
              />
            ) : (
              <Button
                label={t('focus.resume')}
                kind="secondary"
                onPress={() => resumeFocusAction(session.id)}
              />
            )}
            <Button
              label={t('focus.finish')}
              onPress={() => endFocusAction(session.id, 'finished')}
            />
            <Button
              label={t('focus.abandon')}
              kind="secondary"
              onPress={() => endFocusAction(session.id, 'abandoned')}
            />
          </View>
        </GlassPanel>
      </Screen>
    );
  }

  return (
    <Screen>
      {offerRating ? (
        <GlassPanel solidity={1} style={styles.panel} accessibilityLabel={t('focus.rate.title')}>
          <ThemedText variant="caption" tone="secondary">
            {t(
              last.state === 'finished'
                ? 'focus.lastSession.finished'
                : 'focus.lastSession.abandoned',
              {
                minutes: Math.round(last.focusedMs / 60_000),
              },
            )}
          </ThemedText>
          {energyFor?.id === last.id ? (
            <>
              <ThemedText variant="body">{t('focus.rate.difficulty.title')}</ThemedText>
              <RatingChips
                labels={[
                  t('focus.rate.difficulty.easy'),
                  t('focus.rate.difficulty.fair'),
                  t('focus.rate.difficulty.hard'),
                ]}
                a11yPrefix={t('focus.rate.difficulty.title')}
                onPick={(difficulty) => {
                  rateSessionAction(last.id, energyFor.energy, difficulty);
                  setRatedId(last.id);
                  setEnergyFor(null);
                }}
              />
            </>
          ) : (
            <>
              <ThemedText variant="body">{t('focus.rate.title')}</ThemedText>
              <RatingChips
                labels={[t('focus.rate.low'), t('focus.rate.ok'), t('focus.rate.high')]}
                a11yPrefix={t('focus.rate.title')}
                onPick={(energy) => {
                  // one tap already counts (FR-31); the difficulty tap is optional
                  rateSessionAction(last.id, energy);
                  setEnergyFor({ id: last.id, energy });
                }}
              />
            </>
          )}
          <Button
            label={t('focus.rate.skip')}
            kind="secondary"
            onPress={() => {
              setRatedId(last.id);
              setEnergyFor(null);
            }}
          />
        </GlassPanel>
      ) : ratedId !== null && last !== null && ratedId === last.id ? (
        <ThemedText variant="caption" tone="secondary" style={styles.notice}>
          {t('focus.rate.thanks')}
        </ThemedText>
      ) : null}
      <EmptyState title={t('focus.empty.title')} body={t('focus.empty.body')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.6 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  notice: { marginBottom: 12 },
});
