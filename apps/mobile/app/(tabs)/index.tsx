/**
 * Today — timeline + glass recommendation blocks (FR-20/21/22, UC-03) and, from P7, the block
 * actions that log the feedback-loop FACTS (FR-23/25/30, UC-04/06/07): Start → Focus tab, Done,
 * Skip (never red), Move… (start-time picker; the drag returns with P9's proportional timeline),
 * "I did it" on a lapsed block. Lazy lapse scan on open/foreground (File 05 §1). Reads the latest
 * plan for the plan day straight from SQLite (single source of truth), triggers UC-03 lazily,
 * shows the optimistic "Planning…" banner (NFR-P1), labels NFR-R2 fallback plans, and lists tasks
 * the plan could not place — calmly, they simply stay in the Inbox. P8 adds the imported busy
 * rows (FR-03), the File 05 §2 notices (meeting kept / block displaced) and the deferred-wipe
 * banner (ADR-0012 §11). P9 adds the FR-24/UC-05 trade-off sheet when the plan's telemetry
 * carries `infeasible.options` and this device has not answered it yet (ADR-0013 §6).
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';

import { discardPendingWipe, keepPendingWipe } from '../../src/auth/accountTransition';
import { currentUserId } from '../../src/auth/identity';
import { useSessionStore } from '../../src/auth/session';
import { busyEventsQuery, type CalendarEventRow } from '../../src/db/calendar';
import { db } from '../../src/db/client';
import { activeFocusSessionQuery, type FocusSessionRow } from '../../src/db/feedback';
import { decidedPlanIds, type EventRow, tradeoffDecisionsQuery } from '../../src/db/insights';
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
import { useLiveRows, useLiveRowsState } from '../../src/db/useLiveRows';
import type { LocalDb } from '../../src/db/writes';
import {
  correctLapseAction,
  doneBlockAction,
  moveBlockAction,
  skipBlockAction,
  skipDiagnosticAction,
  startFocusAction,
} from '../../src/domain/blockActions';
import { applyTradeoffAction, rejectTradeoffsAction } from '../../src/domain/insightsActions';
import {
  dismissExactAlarmPrompt,
  dismissRemindersPrompt,
  enableRemindersAction,
  isExactAlarmPromptDismissed,
  isRemindersPromptDismissed,
  openExactAlarmSettingsAction,
  reminderExactness,
  reminderPermissionState,
} from '../../src/domain/notificationActions';
import { notificationSettingsOf, timeOnDay } from '../../src/domain/notificationSettings';
import { nextPlanDayOf, planDayOf, requestPlanDayOf } from '../../src/domain/planTrigger';
import { infeasibleOptionsOf } from '../../src/domain/tradeoff';
import {
  hasWorkingWindowOn,
  type MinuteRange,
  type WorkingHours,
} from '../../src/domain/workingHours';
import { t } from '../../src/i18n';
import { usePlanStore } from '../../src/state/plan';
import { useSyncStore } from '../../src/state/sync';
import { useLapseScan } from '../../src/sync/useLapseScan';
import { runPlanRequest, usePlanTrigger } from '../../src/sync/usePlanTrigger';
import { useCurrentProfile } from '../../src/db/useProfile';
import type { PermissionState } from '../../src/notifications/setup';
import type { ExactAlarmState } from '../../modules/exact-alarm';
import { type BlockAction, BlockActions } from '../../src/ui/plan/BlockActions';
import { MovePicker } from '../../src/ui/plan/MovePicker';
import { SkipDiagnosticCard } from '../../src/ui/plan/SkipDiagnosticCard';
import { Timeline } from '../../src/ui/plan/Timeline';
import { TradeOffSheet } from '../../src/ui/plan/TradeOffSheet';
import { Button, EmptyState, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

const localDb = db as unknown as LocalDb;
const PLAN_TABLES = ['plans'] as const;
const REC_TABLES = ['recommendations'] as const;
const TASK_TABLES = ['tasks'] as const;
const SESSION_TABLES = ['focus_sessions'] as const;
const CALENDAR_TABLES = ['calendar_events'] as const;
const EVENT_TABLES = ['events'] as const;
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
  const sessionRefreshedAt = useSessionStore((s) => s.refreshedAt);
  const userId = currentUserId();
  const now = useNow();
  // Display: today's plan if one exists; before 06:00 fall back to the previous plan day's plan.
  const todayDay = requestPlanDayOf(now);
  const planDay = planDayOf(now);
  // The two reads the UC-03 trigger decides on carry a ready flag: their first render is empty
  // before the read resolves, and "empty" must not pass for "no plan" (hardware pass #15).
  const { rows: todayRows, ready: todayReady } = useLiveRowsState<PlanRow>(
    () => latestPlanQuery(localDb, userId, todayDay),
    PLAN_TABLES,
    [userId, todayDay],
  );
  const previousRows = useLiveRows<PlanRow>(
    () => latestPlanQuery(localDb, userId, planDay),
    PLAN_TABLES,
    [userId, planDay],
  );
  const { rows: latestAnyRows, ready: latestReady } = useLiveRowsState<PlanRow>(
    () => latestPlanAnyQuery(localDb, userId),
    PLAN_TABLES,
    [userId],
  );
  // P10 (FR-26): the coming plan day's plan, when the evening ritual made one (06:00 anchor:
  // before 06:00 "tomorrow" is the current calendar day)
  const tomorrowDay = nextPlanDayOf(now);
  const tomorrowRows = useLiveRows<PlanRow>(
    () => latestPlanQuery(localDb, userId, tomorrowDay),
    PLAN_TABLES,
    [userId, tomorrowDay],
  );
  const tomorrowPlanId = tomorrowRows[0]?.id ?? '__none__';
  const tomorrowRecs = useLiveRows<RecommendationRow>(
    () => planRecommendationsQuery(localDb, tomorrowPlanId),
    REC_TABLES,
    [tomorrowPlanId],
  );
  const profile = useCurrentProfile();
  const notifySettings = notificationSettingsOf(profile?.settings ?? null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(() => isRemindersPromptDismissed());
  // FR-50 on Android 12+ (build 6): the exact-alarm app-op, re-read on every foreground — the
  // user flips it on the system screen the card opens
  const [exactness, setExactness] = useState<ExactAlarmState | null>(null);
  const [exactDismissed, setExactDismissed] = useState(() => isExactAlarmPromptDismissed());
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setExactness(reminderExactness());
      void reminderPermissionState().then((p) => {
        if (alive) setPermission(p);
      });
    };
    refresh();
    // back from the OS settings screen: re-read the permission (P10 adversarial #9)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  // Display follows the 06:00 plan day: before 06:00 the previous plan day's plan stays on
  // screen (an evening plan for the calendar day takes over at 06:00 — P10 adversarial #3)
  const plan = planDay !== todayDay ? (previousRows[0] ?? todayRows[0]) : todayRows[0];
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
  const decisionRows = useLiveRows<EventRow>(
    () => tradeoffDecisionsQuery(localDb, userId),
    EVENT_TABLES,
    [userId],
  );
  const notice = useSyncStore((s) => s.notice);
  const pendingWipe = useSyncStore((s) => s.pendingWipe);
  const titles = useMemo(() => new Map(taskRows.map((task) => [task.id, task.title])), [taskRows]);
  const status = usePlanStore((s) => s.status);
  const emptyInbox = usePlanStore((s) => s.emptyInbox);
  const { requestManual } = usePlanTrigger({
    latestPlanDate: latestAnyRows[0]?.planDate ?? null,
    todayPlanDate: todayRows[0]?.planDate ?? null,
    ready: todayReady && latestReady,
    sessionRefreshedAt,
  });
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
  // ADR-0019: the shown day has no working window (declared hours ∖ sleep ∖ 00–06) — the empty
  // state names the day, not the inbox, and the deferred line is not shown (a legacy zero-block
  // row would otherwise read "No room today for N tasks"). Derived from the local profile, so a
  // cold start on a day off needs no request to be truthful.
  const windowOn = (day: string) =>
    profile === undefined ||
    profile.workingHours === undefined ||
    hasWorkingWindowOn(
      day,
      profile.workingHours as WorkingHours,
      (profile.sleepWindow ?? null) as MinuteRange | null,
    );
  const dayOff = !windowOn(shownDay);
  // … and the in-app "Plan tomorrow?" card must not promise a plan the calendar cannot hold
  // either (ADR-0019 §4 — the same rule as the notification; adversarial pass, build 6)
  const tomorrowOff = !windowOn(tomorrowDay);
  // FR-24: the sheet shows once per plan; a decision (or "keep as is") is a fact on this device
  const tradeoffOptions = useMemo(() => infeasibleOptionsOf(plan), [plan]);
  // only today's plan: before 06:00 `plan` may be yesterday's, whose options are stale
  // (P9 adversarial #13)
  const tradeoffOpen =
    plan !== undefined &&
    plan.planDate === todayDay &&
    tradeoffOptions.length > 0 &&
    !decidedPlanIds(decisionRows).has(plan.id);
  const [tradeoffNotice, setTradeoffNotice] = useState<string | null>(null);
  const hasBlocks = plan !== undefined && (recs.length > 0 || busy.length > 0);
  // FR-50: ask for the OS permission once, from a card, only when there is something to remind
  const remindersPrompt =
    hasBlocks &&
    notifySettings.block_reminders &&
    permission === 'undetermined' &&
    !promptDismissed;
  // FR-50 (build 6): reminders are on and allowed, but Android would deliver them inexactly
  const exactAlarmPrompt =
    hasBlocks &&
    notifySettings.block_reminders &&
    permission === 'granted' &&
    exactness === 'denied' &&
    !exactDismissed;
  // FR-26: after the ritual time, with tasks waiting and no plan for tomorrow, offer the one tap
  const inboxCount = taskRows.filter((task) => task.status === 'inbox').length;
  const ritualDue =
    now.getTime() >= timeOnDay(planDay, notifySettings.evening_ritual_time).getTime();
  const tomorrowPlanned = tomorrowRows[0] !== undefined;
  const tomorrowOpen = tomorrowRecs.filter((r) => r.status !== 'expired');
  const tomorrowFirst = tomorrowOpen[0];
  const askTomorrow = ritualDue && !tomorrowPlanned && !tomorrowOff && inboxCount > 0 && !planning;
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
      {remindersPrompt ? (
        <View
          style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          accessibilityRole="summary"
          accessibilityLabel={t('today.reminders.title')}
        >
          <ThemedText>{t('today.reminders.title')}</ThemedText>
          <ThemedText variant="caption">{t('today.reminders.body')}</ThemedText>
          <View style={styles.bannerActions}>
            <Button
              kind="secondary"
              label={t('today.reminders.enable')}
              onPress={() => void enableRemindersAction('today_card').then(setPermission)}
            />
            <Button
              kind="secondary"
              label={t('today.reminders.later')}
              onPress={() => {
                dismissRemindersPrompt();
                setPromptDismissed(true);
              }}
            />
          </View>
        </View>
      ) : null}
      {exactAlarmPrompt ? (
        <View
          style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          accessibilityRole="summary"
          accessibilityLabel={t('today.exactAlarm.title')}
        >
          <ThemedText>{t('today.exactAlarm.title')}</ThemedText>
          <ThemedText variant="caption">{t('today.exactAlarm.body')}</ThemedText>
          <View style={styles.bannerActions}>
            <Button
              kind="secondary"
              label={t('today.exactAlarm.allow')}
              onPress={() => openExactAlarmSettingsAction('today_card')}
            />
            <Button
              kind="secondary"
              label={t('today.exactAlarm.later')}
              onPress={() => {
                dismissExactAlarmPrompt();
                setExactDismissed(true);
              }}
            />
          </View>
        </View>
      ) : null}
      {tomorrowPlanned && tomorrowFirst !== undefined ? (
        <ThemedText variant="caption" tone="secondary" style={styles.notice}>
          {tomorrowOpen.length === 1
            ? t('today.tomorrow.plannedOne', {
                time: tomorrowFirst.slotStart.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : t('today.tomorrow.planned', {
                count: tomorrowOpen.length,
                time: tomorrowFirst.slotStart.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
        </ThemedText>
      ) : null}
      {askTomorrow ? (
        <View
          style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          accessibilityRole="summary"
          accessibilityLabel={t('today.tomorrow.ask')}
        >
          <ThemedText>{t('today.tomorrow.ask')}</ThemedText>
          <ThemedText variant="caption">
            {inboxCount === 1
              ? t('today.tomorrow.ask.bodyOne')
              : t('today.tomorrow.ask.body', { count: inboxCount })}
          </ThemedText>
          <View style={styles.bannerActions}>
            <Button
              kind="secondary"
              label={t('today.tomorrow.accept')}
              onPress={() => void runPlanRequest('evening_ritual', new Date(), tomorrowDay)}
            />
            <Button
              kind="secondary"
              label={t('today.tomorrow.adjust')}
              onPress={() => router.navigate('/(tabs)/inbox')}
            />
          </View>
        </View>
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
      {tradeoffOpen && plan !== undefined ? (
        <TradeOffSheet
          options={tradeoffOptions}
          titles={titles}
          onChoose={(option, rank) => {
            applyTradeoffAction({ plan, option, rank, options: tradeoffOptions });
            setTradeoffNotice(t('tradeoff.applied'));
          }}
          onReject={() => {
            rejectTradeoffsAction({ plan, options: tradeoffOptions });
            setTradeoffNotice(t('tradeoff.rejected'));
          }}
        />
      ) : tradeoffNotice ? (
        <ThemedText variant="caption" tone="secondary" style={styles.notice}>
          {tradeoffNotice}
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
      ) : dayOff ? (
        <EmptyState title={t('today.dayOff.title')} body={t('today.dayOff.body')} />
      ) : emptyInbox ? (
        <EmptyState title={t('today.emptyInbox.title')} body={t('today.emptyInbox.body')} />
      ) : (
        <EmptyState title={t('today.empty.title')} body={t('today.empty.body')} />
      )}
      {unplaced.length > 0 && !dayOff ? (
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
