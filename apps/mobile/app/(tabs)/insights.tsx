/**
 * Insights — the trust surfaces (P9; FR-33, FR-40, FR-41, UC-08; ADR-0013): the learning-mode
 * badge (specs/07 §3.6 rung 2) and where day-0 beliefs came from, the energy heatmap, "what
 * Hourwell believes about you" with ✓/✗ toggles, and the weekly review. The document comes from
 * the `insights` edge function and is cached in MMKV, so the tab renders offline and during a
 * service outage with an honest "as of" line. Toggle state is the device's own `belief_label`
 * facts (newest wins) over the server's labels — a toggle shows immediately and is marked
 * pending until a sync acknowledges it. Nothing here computes a belief (invariant 1).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';

import { currentUserId } from '../../src/auth/identity';
import { useSessionStore } from '../../src/auth/session';
import { db } from '../../src/db/client';
import {
  beliefLabelsQuery,
  type EventRow,
  latestLocalLabels,
  weeklyReviewsQuery,
} from '../../src/db/insights';
import type { TaskCategory } from '../../src/db/tasks';
import { useLiveRows } from '../../src/db/useLiveRows';
import type { LocalDb } from '../../src/db/writes';
import {
  type Belief,
  type BeliefLabel,
  type InsightsDocument,
  isoWeekOf,
} from '../../src/domain/heatmap';
import {
  completeWeeklyReviewAction,
  labelBeliefAction,
  tellBestTimeAction,
} from '../../src/domain/insightsActions';
import { formatRelative } from '../../src/domain/relativeTime';
import { t, type MessageKey } from '../../src/i18n';
import { track } from '../../src/observability/analytics';
import { cachedInsights, fetchInsights } from '../../src/sync/insights';
import { BeliefCard } from '../../src/ui/insights/BeliefCard';
import { EnergyHeatmap } from '../../src/ui/insights/EnergyHeatmap';
import { WeeklyReview } from '../../src/ui/insights/WeeklyReview';
import { Button, EmptyState, GlassPanel, Screen, ThemedText } from '../../src/ui/primitives';

const localDb = db as unknown as LocalDb;
const EVENT_TABLES = ['events'] as const;

type LoadStatus = 'idle' | 'loading' | 'offline' | 'unavailable' | 'no_session' | 'error';

const CHRONOTYPE_KEYS: Record<NonNullable<InsightsDocument['chronotype_class']>, MessageKey> = {
  DM: 'insights.chronotype.DM',
  MM: 'insights.chronotype.MM',
  INT: 'insights.chronotype.INT',
  ME: 'insights.chronotype.ME',
  DE: 'insights.chronotype.DE',
};

export default function InsightsScreen() {
  useSessionStore((s) => s.userId);
  const userId = currentUserId();
  const [cached] = useState(() => cachedInsights());
  const [doc, setDoc] = useState<InsightsDocument | null>(cached?.doc ?? null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(cached?.fetchedAt ?? null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [category, setCategory] = useState<TaskCategory>('deep');
  const [viewedTracked, setViewedTracked] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const labelRows = useLiveRows<EventRow>(() => beliefLabelsQuery(localDb, userId), EVENT_TABLES, [
    userId,
  ]);
  const reviewRows = useLiveRows<EventRow>(
    () => weeklyReviewsQuery(localDb, userId),
    EVENT_TABLES,
    [userId],
  );
  const localLabels = useMemo(() => latestLocalLabels(labelRows), [labelRows]);

  const load = useCallback(async () => {
    setStatus('loading');
    const outcome = await fetchInsights();
    switch (outcome.kind) {
      case 'ok':
        setDoc(outcome.doc);
        setFetchedAt(outcome.fetchedAt);
        setStatus('idle');
        break;
      case 'offline':
        setStatus('offline');
        break;
      case 'unavailable':
        setStatus('unavailable');
        break;
      case 'no-session':
        setStatus('no_session');
        break;
      case 'profile_missing':
        setStatus('idle');
        break;
      case 'failed':
        setStatus('error');
        break;
    }
    setAttempted(true);
  }, []);

  // refresh on mount and on every foreground (the same lazy shape as the plan trigger — no
  // navigation dependency, so the tab renders in the shell test and outside a navigator)
  useEffect(() => {
    void load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  // one analytics mark per visit, after the first load attempt settled (network, cache or empty)
  useEffect(() => {
    if (viewedTracked || !attempted || status === 'loading') return;
    track('insights_viewed', {
      source: doc === null ? 'empty' : status === 'idle' ? 'network' : 'cache',
      learning_mode: doc?.learning_mode ?? null,
    });
    setViewedTracked(true);
  }, [attempted, doc, status, viewedTracked]);

  /** The label in force for a cell: the device's newer fact beats the server's document. */
  const labelOf = useCallback(
    (stateRef: string): Exclude<BeliefLabel, 'none'> | null => {
      const server = doc?.labels.find((l) => l.state_ref === stateRef);
      const serverAt = server === undefined ? -1 : Date.parse(server.labeled_at);
      const local = localLabels.get(stateRef);
      const pick =
        local !== undefined && local.at >= serverAt ? local.label : (server?.label ?? null);
      return pick === 'none' || pick === null ? null : pick;
    },
    [doc, localLabels],
  );
  const pendingOf = useCallback(
    (stateRef: string) => localLabels.get(stateRef)?.pending ?? false,
    [localLabels],
  );
  const onLabel = useCallback(
    (belief: Belief, label: BeliefLabel, surface: 'beliefs' | 'review') => {
      labelBeliefAction(belief, label, surface);
    },
    [],
  );

  const thisWeek = isoWeekOf(new Date());
  const doneThisWeek =
    reviewRows.length > 0 &&
    ((reviewRows[0]!.payload ?? {}) as { week?: unknown }).week === thisWeek;
  const labelsSet =
    doc === null ? 0 : doc.beliefs.filter((b) => labelOf(b.state_ref) !== null).length;

  const noticeKey: MessageKey | null =
    status === 'offline'
      ? 'insights.offline'
      : status === 'unavailable'
        ? 'insights.unavailable'
        : status === 'no_session'
          ? 'insights.noSession'
          : status === 'error'
            ? 'insights.error'
            : null;
  const when = fetchedAt === null ? '' : formatRelative(fetchedAt);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ThemedText variant="h2">{t('insights.title')}</ThemedText>
          <Button
            label={status === 'loading' ? t('insights.refreshing') : t('insights.refresh')}
            kind="secondary"
            onPress={() => void load()}
            disabled={status === 'loading'}
          />
        </View>
        {noticeKey ? (
          <ThemedText variant="caption" tone="secondary" style={styles.notice}>
            {t(noticeKey, { when })}
          </ThemedText>
        ) : fetchedAt !== null ? (
          <ThemedText variant="caption" tone="secondary" style={styles.notice}>
            {t('insights.asOf', { when })}
          </ThemedText>
        ) : null}

        {doc === null ? (
          <EmptyState title={t('insights.empty.title')} body={t('insights.empty.body')} />
        ) : (
          <>
            <GlassPanel solidity={1} style={styles.badge} accessibilityRole="summary">
              <ThemedText variant="body">
                {doc.learning_mode ? t('insights.learningMode.title') : t('insights.title')}
              </ThemedText>
              <ThemedText variant="caption" tone="secondary">
                {doc.learning_mode
                  ? t('insights.learningMode.body')
                  : t('insights.personalMode.body')}
              </ThemedText>
              <ThemedText variant="caption" tone="secondary">
                {doc.survey_skipped || doc.chronotype_class === null
                  ? t('insights.chronotype.skipped')
                  : t('insights.chronotype.body', {
                      label: t(CHRONOTYPE_KEYS[doc.chronotype_class]),
                    })}
              </ThemedText>
            </GlassPanel>

            <EnergyHeatmap cells={doc.heatmap} category={category} onCategoryChange={setCategory} />

            <View style={styles.section}>
              <ThemedText variant="h2">{t('beliefs.title')}</ThemedText>
              <ThemedText variant="caption" tone="secondary">
                {t('beliefs.subtitle')}
              </ThemedText>
              {doc.beliefs.length === 0 ? (
                <ThemedText variant="caption" tone="secondary">
                  {t('beliefs.empty')}
                </ThemedText>
              ) : (
                [...doc.beliefs]
                  .sort(
                    (a, b) =>
                      Number(b.affinity) - Number(a.affinity) || b.confidence - a.confidence,
                  )
                  .map((b) => (
                    <BeliefCard
                      key={b.state_ref}
                      belief={b}
                      label={labelOf(b.state_ref)}
                      pending={pendingOf(b.state_ref)}
                      onLabel={(label) => onLabel(b, label, 'beliefs')}
                    />
                  ))
              )}
            </View>

            <WeeklyReview
              adherence={doc.adherence}
              beliefs={doc.beliefs}
              labelOf={labelOf}
              pendingOf={pendingOf}
              onLabel={(b, label) => onLabel(b, label, 'review')}
              onTell={tellBestTimeAction}
              onDone={({ learnings, trend }) =>
                completeWeeklyReviewAction({ week: thisWeek, learnings, labelsSet, trend })
              }
              doneThisWeek={doneThisWeek}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  notice: { marginBottom: 12 },
  badge: { marginBottom: 16, gap: 4 },
  section: { gap: 8, marginBottom: 20 },
});
