/**
 * Today — timeline + glass recommendation blocks (FR-20/21/22, UC-03). Reads the latest plan
 * for the plan day straight from SQLite (single source of truth; the bridge in src/sync mirrors
 * the edge function's response there), triggers UC-03 lazily on open/foreground, shows the
 * optimistic "Planning…" banner while a request runs (NFR-P1), labels NFR-R2 fallback plans,
 * and lists tasks the plan could not place — calmly, they simply stay in the Inbox.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { currentUserId } from '../../src/auth/identity';
import { useSessionStore } from '../../src/auth/session';
import { db } from '../../src/db/client';
import {
  isFallbackPlan,
  latestPlanAnyQuery,
  latestPlanQuery,
  planRecommendationsQuery,
  unplacedOf,
  type PlanRow,
  type RecommendationRow,
} from '../../src/db/plans';
import { activeTasksQuery } from '../../src/db/tasks';
import type { TaskRow } from '../../src/db/tasks';
import { useLiveRows } from '../../src/db/useLiveRows';
import type { LocalDb } from '../../src/db/writes';
import { planDayOf, requestPlanDayOf } from '../../src/domain/planTrigger';
import { t } from '../../src/i18n';
import { usePlanStore } from '../../src/state/plan';
import { usePlanTrigger } from '../../src/sync/usePlanTrigger';
import { Timeline } from '../../src/ui/plan/Timeline';
import { Button, EmptyState, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

const localDb = db as unknown as LocalDb;
const PLAN_TABLES = ['plans'] as const;
const REC_TABLES = ['recommendations'] as const;
const TASK_TABLES = ['tasks'] as const;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function TodayScreen() {
  const theme = useTheme();
  useSessionStore((s) => s.userId);
  const userId = currentUserId();
  const now = useNow();
  // Display: today's plan if one exists; before 06:00 fall back to the previous plan day's plan.
  const todayDay = requestPlanDayOf(now);
  const planDay = planDayOf(now);
  const todayRows = useLiveRows<PlanRow>(
    () => latestPlanQuery(localDb, userId, todayDay),
    PLAN_TABLES,
    [userId, todayDay],
  );
  const previousRows = useLiveRows<PlanRow>(
    () => latestPlanQuery(localDb, userId, planDay),
    PLAN_TABLES,
    [userId, planDay],
  );
  const latestAnyRows = useLiveRows<PlanRow>(
    () => latestPlanAnyQuery(localDb, userId),
    PLAN_TABLES,
    [userId],
  );
  const plan = todayRows[0] ?? (planDay !== todayDay ? previousRows[0] : undefined);
  const planId = plan?.id ?? '__none__';
  const recs = useLiveRows<RecommendationRow>(
    () => planRecommendationsQuery(localDb, planId),
    REC_TABLES,
    [planId],
  );
  const taskRows = useLiveRows<TaskRow>(() => activeTasksQuery(localDb, userId), TASK_TABLES, [
    userId,
  ]);
  const titles = useMemo(() => new Map(taskRows.map((task) => [task.id, task.title])), [taskRows]);
  const status = usePlanStore((s) => s.status);
  const emptyInbox = usePlanStore((s) => s.emptyInbox);
  const { requestManual } = usePlanTrigger(latestAnyRows[0]?.planDate ?? null);

  const unplaced = unplacedOf(plan);
  const planning = status === 'planning';
  const hasBlocks = plan !== undefined && recs.length > 0;
  const noticeKey =
    status === 'error'
      ? 'today.error'
      : status === 'rate_limited'
        ? 'today.rateLimited'
        : status === 'no_session'
          ? 'today.noSession'
          : status === 'offline'
            ? 'today.offline'
            : null;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText variant="h2">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </ThemedText>
        <Button
          label={hasBlocks ? t('today.replan') : t('today.plan')}
          kind="secondary"
          onPress={requestManual}
          disabled={planning}
        />
      </View>
      {planning ? (
        <View
          style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          accessibilityRole="progressbar"
          accessibilityLabel={t('today.planning')}
        >
          <ThemedText variant="caption">{t('today.planning')}</ThemedText>
        </View>
      ) : null}
      {noticeKey ? (
        <ThemedText variant="caption" tone="secondary" style={styles.notice}>
          {t(noticeKey)}
        </ThemedText>
      ) : null}
      {isFallbackPlan(plan) ? (
        <ThemedText
          variant="caption"
          tone="secondary"
          style={styles.notice}
          accessibilityLabel={t('today.engine.a11y')}
        >
          {t('today.fallback')}
        </ThemedText>
      ) : null}
      {hasBlocks ? (
        <Timeline recommendations={recs} titles={titles} now={now} />
      ) : emptyInbox ? (
        <EmptyState title={t('today.emptyInbox.title')} body={t('today.emptyInbox.body')} />
      ) : (
        <EmptyState title={t('today.empty.title')} body={t('today.empty.body')} />
      )}
      {unplaced.length > 0 ? (
        <View style={styles.deferred} accessibilityRole="summary">
          <ThemedText variant="caption" tone="secondary">
            {unplaced.length === 1
              ? t('today.deferred.one')
              : t('today.deferred.body', { count: unplaced.length })}
          </ThemedText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  banner: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  notice: { marginBottom: 12 },
  deferred: { paddingVertical: 12 },
});
