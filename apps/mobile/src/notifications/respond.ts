/**
 * What happens when the user acts on a local notification (ADR-0014 §3–§4): the response is a
 * FACT (`notification_response`, FR-32 "notification response") appended through the outbox,
 * mirrored categorically to analytics, then routed — a block reminder opens Today, the ritual's
 * `accept` plans tomorrow (FR-26 one tap), `adjust` opens the Inbox, a plain tap on the Sunday
 * variant opens the weekly review (UC-08). Pure over injected deps; the component wires it.
 */
import * as Notifications from 'expo-notifications';
import { DEFAULT_ACTION_IDENTIFIER, type NotificationResponse } from 'expo-notifications';

import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import { appendEvent, type LocalDb } from '../db/writes';
import { nextPlanDayOf } from '../domain/planTrigger';
import { track } from '../observability/analytics';
import { appStorage, StorageKeys } from '../storage/mmkv';
import { scheduleSync } from '../sync/engine';
import { runPlanRequest } from '../sync/usePlanTrigger';

import type { NotificationData } from './scheduler';
import { ACTION_ACCEPT, ACTION_ADJUST } from './setup';

export type ResponseAction = 'open' | 'accept' | 'adjust';
export type Route = '/(tabs)' | '/(tabs)/inbox' | '/(tabs)/insights';

export interface ResponseDeps {
  now(): Date;
  userId(): string;
  /** Append the fact (SQLite + outbox); returns the op id. */
  appendFact(input: {
    userId: string;
    recommendationId?: string;
    taskId?: string;
    payload: Record<string, unknown>;
    now: Date;
  }): string;
  sync(): void;
  planTomorrow(now: Date, planDate: string): void;
  navigate(route: Route): void;
  /** Cold-start dedup: the same response may arrive twice (last-response hook + listener). */
  alreadyHandled(key: string): boolean;
  markHandled(key: string): void;
  /**
   * Remove the notification from the shade once its response is handled. A body tap auto-cancels
   * (AUTO_CANCEL), an ACTION BUTTON does not: on the Pixel 7a the ritual stayed posted after
   * "Plan tomorrow" had already planned the day (build 4, hardware pass 2026-09-04) — a second
   * tap would plan it again.
   */
  dismiss(identifier: string): void;
}

export function actionOf(actionIdentifier: string): ResponseAction {
  if (actionIdentifier === ACTION_ACCEPT) return 'accept';
  if (actionIdentifier === ACTION_ADJUST) return 'adjust';
  return 'open';
}

function dataOf(response: NotificationResponse): NotificationData | null {
  const raw = response.notification.request.content.data as Partial<NotificationData> | null;
  if (raw === null || typeof raw !== 'object') return null;
  if (raw.kind !== 'block_reminder' && raw.kind !== 'evening_ritual') return null;
  return {
    kind: raw.kind,
    recommendation_id:
      typeof raw.recommendation_id === 'string' ? raw.recommendation_id : undefined,
    task_id: typeof raw.task_id === 'string' ? raw.task_id : undefined,
    scheduled_for: typeof raw.scheduled_for === 'number' ? raw.scheduled_for : 0,
    variant: raw.variant === 'sunday' ? 'sunday' : raw.variant === 'daily' ? 'daily' : undefined,
  };
}

/**
 * Dedup key for one response. The last-response hook and the listener deliver the SAME response
 * twice on a cold start (same notification, same action); a DIFFERENT action on the same
 * notification is a new response — on the Pixel 7a "Adjust tasks" after "Plan tomorrow" was
 * silently dropped and the app just opened Today (build 4, hardware pass 2026-09-04).
 */
export function responseKey(response: NotificationResponse): string {
  return `${response.notification.request.identifier}@${response.notification.date}#${response.actionIdentifier}`;
}

/** Route for (kind, action, variant) — pure. */
export function routeFor(data: NotificationData, action: ResponseAction): Route {
  if (data.kind === 'block_reminder') return '/(tabs)';
  if (action === 'adjust') return '/(tabs)/inbox';
  if (action === 'accept') return '/(tabs)';
  return data.variant === 'sunday' ? '/(tabs)/insights' : '/(tabs)';
}

/** Handle one response exactly once. Returns what was done (for tests / logs). */
export function handleNotificationResponse(
  response: NotificationResponse,
  deps: ResponseDeps,
): { handled: boolean; action?: ResponseAction; route?: Route } {
  const key = responseKey(response);
  if (deps.alreadyHandled(key)) return { handled: false };
  deps.markHandled(key);
  const data = dataOf(response);
  if (data === null) return { handled: false };
  const action = actionOf(response.actionIdentifier);
  const now = deps.now();
  deps.appendFact({
    userId: deps.userId(),
    recommendationId: data.recommendation_id,
    taskId: data.task_id,
    payload: {
      kind: data.kind,
      action,
      variant: data.variant ?? null,
      scheduled_for: data.scheduled_for > 0 ? new Date(data.scheduled_for).toISOString() : null,
      latency_ms: data.scheduled_for > 0 ? Math.max(0, now.getTime() - data.scheduled_for) : null,
    },
    now,
  });
  deps.sync();
  deps.dismiss(response.notification.request.identifier);
  track('notification_opened', { kind: data.kind, action, variant: data.variant ?? null });
  if (data.kind === 'evening_ritual' && action === 'accept') {
    // the day after the ritual's OWN plan day — a 22:00 ritual tapped at 00:30 plans the coming
    // day, not the one after (P10 adversarial #2)
    const anchor = data.scheduled_for > 0 ? new Date(data.scheduled_for) : now;
    deps.planTomorrow(now, nextPlanDayOf(anchor));
  }
  const route = routeFor(data, action);
  deps.navigate(route);
  return { handled: true, action, route };
}

/** The app's deps: SQLite fact, debounced sync, plan request, MMKV dedup. */
export function appResponseDeps(navigate: (route: Route) => void): ResponseDeps {
  const localDb = db as unknown as LocalDb;
  return {
    now: () => new Date(),
    userId: currentUserId,
    appendFact: (input) =>
      localDb.transaction((tx) =>
        appendEvent(tx, {
          userId: input.userId,
          type: 'notification_response',
          recommendationId: input.recommendationId,
          taskId: input.taskId,
          payload: input.payload,
          now: input.now,
        }),
      ),
    sync: () => scheduleSync('write'),
    planTomorrow: (now, planDate) => void runPlanRequest('evening_ritual', now, planDate),
    navigate,
    alreadyHandled: (key) => appStorage.getString(StorageKeys.lastNotificationResponse) === key,
    markHandled: (key) => appStorage.set(StorageKeys.lastNotificationResponse, key),
    dismiss: (identifier) => {
      Notifications.dismissNotificationAsync(identifier).catch(() => undefined); // already gone is fine
    },
  };
}

export { DEFAULT_ACTION_IDENTIFIER };
