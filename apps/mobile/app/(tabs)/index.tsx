/**
 * Today — timeline + glass recommendation blocks (FR-20/21/22, UC-03) and, from P7, the block
 * actions that log the feedback-loop FACTS (FR-23/25/30, UC-04/06/07): Start → Focus tab, Done,
 * Skip (never red), Move… (start-time picker; the drag returns with P9's proportional timeline),
 * "I did it" on a lapsed block. Lazy lapse scan on open/foreground (File 05 §1). Reads the latest
 * plan for the plan day straight from SQLite (single source of truth), triggers UC-03 lazily,
 * shows the optimistic "Planning…" banner (NFR-P1), labels NFR-R2 fallback plans, and lists tasks
 * the plan could not place — calmly, they simply stay in the Inbox. P8 adds the imported busy
 * rows (FR-03), the File 05 §2 notices (meeting kept / block displaced) and the deferred-wipe
 * banner (ADR-0012 §11).
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { discardPendingWipe, keepPendingWipe } from '../../src/auth/accountTransition';
import { currentUserId } from '../../src/auth/identity';
import { useSessionStore } from '../../src/auth/session';
import { busyEventsQuery, type CalendarEventRow } from '../../src/db/calendar';
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
import { useSyncStore } from '../../src/state/sync';
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
const CALENDAR_TABLES = ['calendar_events'] as const;
/** A sync notice is shown for a minute, then fades (never modal, never red). */
const NOTICE_TTL_MS = 60_000;

function dayBounds(planDate: string): { from: Date; to: Date } {
  const [y, m, d] = planDate.split('-').map(Number);
  const from = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

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
  const shownDay = plan?.planDate ?? todayDay;
  const busy = useLiveRows<CalendarEventRow>(
    () => {
      const { from, to } = dayBounds(shownDay);
      return busyEventsQuery(localDb, userId, from, to);
    },
    CALENDAR_TABLES,
    [userId, shownDay],
  );
  const notice = useSyncStore((s) => s.notice);
  const pendingWipe = useSyncStore((s) => s.pendingWipe);
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
  const hasBlocks = plan !== undefined && (recs.length > 0 || busy.length > 0);
  const liveNotice = notice !== null && now.getTime() - notice.at < NOTICE_TTL_MS ? notice : null;
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
      {pendingWipe ? (
        <View
          style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          accessibilityRole="summary"
        >
          <ThemedText variant="caption">
            {t('today.wipe.body', { count: pendingWipe.ops })}
          </ThemedText>
          <View style={styles.bannerActions}>
            <Button
              kind="secondary"
              label={t('today.wipe.keep')}
              onPress={() => keepPendingWipe()}
            />
            <Button
              kind="secondary"
              label={t('today.wipe.discard')}
              onPress={() =>
                // destructive and not undoable: confirm first (invariant 14; adversarial #3)
                Alert.alert(t('today.wipe.confirm.title'), t('today.wipe.confirm.body'), [
                  { text: t('today.wipe.confirm.cancel'), style: 'cancel' },
                  {
                    text: t('today.wipe.confirm.discard'),
                    style: 'destructive',
                    onPress: () => discardPendingWipe(localDb),
                  },
                ])
              }
            />
          </View>
        </View>
      ) : null}
      {liveNotice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.notice.dismiss')}
          onPress={() => useSyncStore.setState({ notice: null })}
          style={styles.notice}
        >
          <ThemedText variant="caption" tone="secondary">
            {liveNotice.kind === 'meeting_kept'
              ? t('today.notice.meetingKept')
              : liveNotice.count === 1
                ? t('today.notice.displaced')
                : t('today.notice.displacedMany', { count: liveNotice.count })}
          </ThemedText>
        </Pressable>
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
          busy={busy}
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
  bannerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  notice: { marginBottom: 12 },
  deferred: { paddingVertical: 12 },
});
