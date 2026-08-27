/**
 * Today — timeline + glass recommendation blocks (FR-20/21/22, UC-03) and, from P7, the block
 * actions that log the feedback-loop FACTS (FR-23/25/30, UC-04/06/07): Start → Focus tab, Done,
 * Skip (never red), Move… (start-time picker; the drag returns with P9's proportional timeline),
 * "I did it" on a lapsed block. Lazy lapse scan on open/foreground (File 05 §1). Reads the latest
 * plan for the plan day straight from SQLite (single source of truth), triggers UC-03 lazily,
 * shows the optimistic "Planning…" banner (NFR-P1), labels NFR-R2 fallback plans, and lists tasks
 * the plan could not place — calmly, they simply stay in the Inbox.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { currentUserId } from '../../src/auth/identity';
import { useSessionStore } from '../../src/auth/session';
import { db } from '../../src/db/client';
import { activeFocusSessionQuery, type FocusSessionRow } from '../../src/db/feedback';
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
import {
  correctLapseAction,
  doneBlockAction,
  moveBlockAction,
  skipBlockAction,
  skipDiagnosticAction,
  startFocusAction,
} from '../../src/domain/blockActions';
import { planDayOf, requestPlanDayOf } from '../../src/domain/planTrigger';
import { t } from '../../src/i18n';
import { usePlanStore } from '../../src/state/plan';
import { useLapseScan } from '../../src/sync/useLapseScan';
import { usePlanTrigger } from '../../src/sync/usePlanTrigger';
import { type BlockAction, BlockActions } from '../../src/ui/plan/BlockActions';
import { MovePicker } from '../../src/ui/plan/MovePicker';
import { SkipDiagnosticCard } from '../../src/ui/plan/SkipDiagnosticCard';
import { Timeline } from '../../src/ui/plan/Timeline';
import { Button, EmptyState, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

const localDb = db as unknown as LocalDb;
const PLAN_TABLES = ['plans'] as const;
const REC_TABLES = ['recommendations'] as const;
const TASK_TABLES = ['tasks'] as const;
const SESSION_TABLES = ['focus_sessions'] as const;

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
  const router = useRouter();
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
  const sessions = useLiveRows<FocusSessionRow>(
    () => activeFocusSessionQuery(localDb, userId),
    SESSION_TABLES,
    [userId],
  );
  const activeSession = sessions[0] ?? null;
  const titles = useMemo(() => new Map(taskRows.map((task) => [task.id, task.title])), [taskRows]);
  const status = usePlanStore((s) => s.status);
  const emptyInbox = usePlanStore((s) => s.emptyInbox);
  const { requestManual } = usePlanTrigger(latestAnyRows[0]?.planDate ?? null);
  const lapse = useLapseScan();

  const [moving, setMoving] = useState<RecommendationRow | null>(null);
  const [diagnosticTask, setDiagnosticTask] = useState<TaskRow | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);
  const diagnostic = diagnosticTask ?? lapse.diagnosticTask;

  const onAction = useCallback(
    (action: BlockAction, rec: RecommendationRow) => {
      switch (action) {
        case 'start':
          startFocusAction(rec);
          router.navigate('/(tabs)/focus');
          break;
        case 'done':
          doneBlockAction(rec);
          break;
        case 'skip': {
          const r = skipBlockAction(rec);
          if (r.diagnosticDue) setDiagnosticTask(r.task);
          break;
        }
        case 'move':
          setMoving(rec);
          break;
        case 'did_it':
          correctLapseAction(rec);
          break;
      }
    },
    [router],
  );

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
      {diagnostic ? (
        <SkipDiagnosticCard
          title={diagnostic.title}
          onAnswer={(answer) => {
            skipDiagnosticAction(diagnostic.id, answer);
            setDiagnosticResult(
              answer === 'too_big'
                ? t('diagnostic.tooBig.result')
                : answer === 'wrong_time'
                  ? t('diagnostic.wrongTime.result')
                  : t('diagnostic.notImportant.result'),
            );
            setDiagnosticTask(null);
            lapse.dismissDiagnostic();
          }}
          onLater={() => {
            setDiagnosticTask(null);
            lapse.dismissDiagnostic();
          }}
        />
      ) : diagnosticResult ? (
        <ThemedText variant="caption" tone="secondary" style={styles.notice}>
          {diagnosticResult}
        </ThemedText>
      ) : null}
      {moving ? (
        <MovePicker
          recommendation={moving}
          title={titles.get(moving.taskId) ?? t('task.notFound')}
          onConfirm={(toStart) => {
            moveBlockAction(moving, toStart);
            setMoving(null);
          }}
          onCancel={() => setMoving(null)}
        />
      ) : null}
      {hasBlocks ? (
        <Timeline
          recommendations={recs}
          titles={titles}
          now={now}
          activeRecommendationId={activeSession?.recommendationId ?? null}
          renderActions={(rec, title) => (
            <BlockActions
              recommendation={rec}
              title={title}
              active={activeSession?.recommendationId === rec.id}
              busyElsewhere={activeSession !== null}
              onAction={onAction}
            />
          )}
        />
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
