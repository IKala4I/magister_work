/**
 * Screenshot fixture — the demo day (see clock.ts for when this runs at all). One invented
 * person, a moderately morning chronotype with the default working hours, four weeks in: a
 * Friday plan with a finished block, a running focus session, an experiment block and the
 * afternoon still ahead; a few tasks waiting in the Inbox; and the Insights document that
 * services/recsys/scripts/screenshot_insights.py built with the service's own code.
 *
 * Rows are written straight into the local mirror, with no outbox ops: in the system they would
 * have arrived from the server, and in this build there is no server to push them to. Every
 * rationale is a key from the closed vocabulary (src/domain/rationale.ts), so the sentences on
 * screen are the app's own catalog, in whatever language the device runs.
 */
import { eq } from 'drizzle-orm';

import { currentUserId } from '../auth/identity';
import { focusSessions, plans, profiles, recommendations, tasks } from '../db/schema';
import { deviceTimeZone, type LocalDb } from '../db/writes';
import { dismissRemindersPrompt } from '../domain/notificationActions';
import { localDayOf } from '../domain/localDay';
import { DEFAULT_SLEEP_WINDOW, DEFAULT_WORKING_HOURS } from '../domain/workingHours';
import type { InsightsDocument } from '../domain/heatmap';
import { appStorage, StorageKeys } from '../storage/mmkv';
import type { CachedInsights } from '../sync/insights';

import insightsDocument from './insights.json';

type Category = (typeof tasks.$inferInsert)['category'];

interface FixtureTask {
  id: string;
  title: string;
  category: Category;
  minutes: number;
  value: number;
  /** Deadline as [days from today, hour, minute]; omitted = none. */
  deadline?: [number, number, number];
}

interface FixtureBlock {
  task: string;
  start: [number, number];
  confidence: number;
  rationaleKey: string;
  rationaleParams: Record<string, unknown>;
  isExperiment?: boolean;
  status?: 'shown' | 'completed';
}

/** Ukrainian titles: the figure illustrates the Ukrainian interface (task text is user data). */
export const FIXTURE_TASKS: readonly FixtureTask[] = [
  { id: 'fx-mail', title: 'Розібрати робочу пошту', category: 'admin', minutes: 15, value: 2 },
  {
    id: 'fx-report',
    title: 'Чернетка квартального звіту',
    category: 'deep',
    minutes: 90,
    value: 3,
    deadline: [3, 12, 0],
  },
  {
    id: 'fx-suppliers',
    title: 'Відповісти постачальникам',
    category: 'admin',
    minutes: 30,
    value: 2,
  },
  {
    id: 'fx-course',
    title: 'Курс з аналізу даних: модуль 4',
    category: 'learning',
    minutes: 45,
    value: 2,
  },
  {
    id: 'fx-slides',
    title: 'Слайди для презентації клієнту',
    category: 'deep',
    minutes: 90,
    value: 3,
    deadline: [0, 18, 0],
  },
  {
    id: 'fx-bills',
    title: 'Оплатити рахунки за інтернет',
    category: 'admin',
    minutes: 15,
    value: 1,
  },
  { id: 'fx-gym', title: 'Тренування в спортзалі', category: 'physical', minutes: 60, value: 2 },
];

/** Waiting in the Inbox — what the quick-add screenshot has above its keyboard. */
export const FIXTURE_INBOX: readonly FixtureTask[] = [
  {
    id: 'fx-dentist',
    title: 'Записатися до стоматолога',
    category: 'admin',
    minutes: 15,
    value: 2,
  },
  {
    id: 'fx-article',
    title: 'Прочитати статтю про інтервальне повторення',
    category: 'learning',
    minutes: 30,
    value: 1,
  },
  { id: 'fx-bike', title: 'Полагодити велосипед', category: 'physical', minutes: 45, value: 1 },
  {
    id: 'fx-budget',
    title: 'Бюджет на листопад',
    category: 'deep',
    minutes: 60,
    value: 2,
    deadline: [4, 23, 59],
  },
];

/** Friday's plan. The deep-morning factor is the Insights document's own (+38 %). */
export const FIXTURE_BLOCKS: readonly FixtureBlock[] = [
  {
    task: 'fx-mail',
    start: [9, 0],
    confidence: 0.78,
    rationaleKey: 'earliest_feasible',
    rationaleParams: { category: 'admin' },
    status: 'completed',
  },
  {
    task: 'fx-report',
    start: [9, 15],
    confidence: 0.83,
    rationaleKey: 'energy_peak',
    rationaleParams: { category: 'deep', daypart: 'MO', factor: 1.38 },
  },
  {
    task: 'fx-suppliers',
    start: [11, 0],
    confidence: 0.66,
    rationaleKey: 'best_available',
    rationaleParams: { category: 'admin', daypart: 'MO' },
  },
  {
    task: 'fx-course',
    start: [12, 15],
    confidence: 0.31,
    rationaleKey: 'experiment',
    rationaleParams: { category: 'learning', daypart: 'MD' },
    isExperiment: true,
  },
  {
    task: 'fx-slides',
    start: [14, 0],
    confidence: 0.72,
    rationaleKey: 'deadline_pressure',
    rationaleParams: { hours_to_deadline: 4 },
  },
  {
    task: 'fx-bills',
    start: [16, 0],
    confidence: 0.58,
    rationaleKey: 'best_available',
    rationaleParams: { category: 'admin', daypart: 'AF' },
  },
  {
    task: 'fx-gym',
    start: [17, 0],
    confidence: 0.52,
    rationaleKey: 'best_available',
    rationaleParams: { category: 'physical', daypart: 'EV' },
  },
];

/** The running session: deep work started a minute into its block. */
export const FIXTURE_FOCUS = { block: 'fx-report', startedAt: [9, 16] as [number, number] };
/** ε/|A| for the experiment block (ADR-0008 §1: ε = 0.1, three eligible arms). */
const EXPERIMENT_PROPENSITY = 0.1 / 3;

function at(day: Date, hour: number, minute: number, plusDays = 0): Date {
  const d = new Date(day);
  d.setDate(d.getDate() + plusDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function taskRow(userId: string, task: FixtureTask, today: Date, status: 'inbox' | 'scheduled') {
  const created = at(today, 8, 0, -3);
  return {
    id: task.id,
    userId,
    title: task.title,
    category: task.category,
    estMinutes: task.minutes,
    deadline: task.deadline
      ? at(today, task.deadline[1], task.deadline[2], task.deadline[0])
      : null,
    value: task.value,
    status,
    createdAt: created,
    updatedAt: created,
  } satisfies typeof tasks.$inferInsert;
}

/** Seed the demo day once per install. Returns false when it was already there. */
export function seedFixture(db: LocalDb, now: Date = new Date()): boolean {
  const userId = currentUserId();
  const existing = db.select().from(profiles).where(eq(profiles.userId, userId)).all();
  if (existing.length > 0) return false;

  const today = at(now, 0, 0);
  const planDate = localDayOf(now);
  const planId = `fx-plan-${planDate}`;
  const generatedAt = at(today, 6, 30);
  const byId = new Map(FIXTURE_TASKS.map((task) => [task.id, task]));

  db.transaction((tx) => {
    tx.insert(profiles)
      .values({
        userId,
        timezone: deviceTimeZone(),
        locale: 'uk',
        workingHours: DEFAULT_WORKING_HOURS,
        sleepWindow: DEFAULT_SLEEP_WINDOW,
        rmeqScore: 19,
        chronotypeClass: 'MM',
        topCategories: ['deep', 'learning'],
        onboardingCompletedAt: at(today, 20, 15, -28),
        updatedAt: at(today, 20, 15, -28),
      })
      .run();
    for (const task of FIXTURE_TASKS) {
      const row = taskRow(userId, task, today, 'scheduled');
      tx.insert(tasks)
        .values(task.id === 'fx-mail' ? { ...row, status: 'done', doneAt: at(today, 9, 13) } : row)
        .run();
    }
    for (const task of FIXTURE_INBOX)
      tx.insert(tasks)
        .values(taskRow(userId, task, today, 'inbox'))
        .run();
    tx.insert(plans)
      .values({
        id: planId,
        userId,
        planDate,
        engine: 'learned',
        modelVersion: 'fixture',
        solverStatus: 'OPTIMAL',
        telemetry: {},
        generatedAt,
      })
      .run();
    for (const block of FIXTURE_BLOCKS) {
      const task = byId.get(block.task);
      if (task === undefined) throw new Error(`fixture block for unknown task ${block.task}`);
      const slotStart = at(today, block.start[0], block.start[1]);
      const slotEnd = new Date(slotStart.getTime() + task.minutes * 60_000);
      tx.insert(recommendations)
        .values({
          id: `fx-rec-${task.id}`,
          userId,
          planId,
          taskId: task.id,
          slotStart,
          slotEnd,
          contextBucket: 'fixture',
          qHat: block.confidence,
          confidence: block.confidence,
          rationaleKey: block.rationaleKey,
          rationaleParams: block.rationaleParams,
          isExperiment: block.isExperiment ?? false,
          engine: 'learned',
          modelVersion: 'fixture',
          status: block.status ?? 'shown',
          propensity: block.isExperiment ? EXPERIMENT_PROPENSITY : null,
          createdAt: generatedAt,
          updatedAt: block.status === 'completed' ? at(today, 9, 13) : generatedAt,
        })
        .run();
    }
    const focusTask = byId.get(FIXTURE_FOCUS.block);
    const startedAt = at(today, FIXTURE_FOCUS.startedAt[0], FIXTURE_FOCUS.startedAt[1]);
    tx.insert(focusSessions)
      .values({
        id: 'fx-focus',
        userId,
        recommendationId: `fx-rec-${FIXTURE_FOCUS.block}`,
        taskId: FIXTURE_FOCUS.block,
        state: 'running',
        startedAt,
        lastResumedAt: startedAt,
        plannedMinutes: focusTask?.minutes ?? 90,
        estMinutes: focusTask?.minutes ?? 90,
        createdAt: startedAt,
        updatedAt: startedAt,
      })
      .run();
  });

  const cached: CachedInsights = {
    doc: insightsDocument as unknown as InsightsDocument,
    fetchedAt: now.getTime() - 4 * 60_000,
    userId,
  };
  appStorage.set(StorageKeys.insightsCache, JSON.stringify(cached));
  // the reminders card would sit on top of the plan; this person dismissed it weeks ago (the
  // Android-only exact-alarm card never shows on iOS, and its dismiss also logs analytics)
  dismissRemindersPrompt();
  return true;
}
