/**
 * Typed analytics catalog (NFR-O1, event half). `track` accepts only names and
 * property shapes declared here, so every event the app can emit is reviewable in
 * one place. Recommendation-lifecycle events must carry the model version + engine
 * tag (NFR-O1: every shown plan is attributable to the model that produced it) —
 * that requirement is pinned at compile time by extending ModelVersionTag and by
 * the type assertions in __tests__/analytics.test.ts.
 *
 * Privacy rule (NFR-S2/NFR-S3): property values are enums, booleans, and numbers
 * only. No user-authored text — task titles, notes, or NL quick-add input — may
 * ever appear in an event property. New events go through the UI-review checklist.
 */

/** Required on every recommendation-lifecycle event (NFR-O1). */
export type ModelVersionTag = {
  /** Model registry version that produced the plan (or heuristic build tag). */
  model_version: string;
  /**
   * Which engine answered: the learned engine (bandit service) or the NFR-R2 heuristic
   * fallback. Values match `recommendations.engine` in the schema — one vocabulary
   * everywhere, or P6 inherits a fork between analytics and stored rows.
   */
  engine: 'learned' | 'heuristic';
};

export type AnalyticsEvents = {
  /** FR-10/FR-11 (P3): a task reached the local mirror. */
  task_created: {
    source: 'quick_add' | 'form';
    nl_parse_used: boolean;
    has_deadline: boolean;
    has_duration: boolean;
  };
  /**
   * FR-20/FR-22 (P6 wires the emit; the shape is fixed now so the NFR-O1 tag is
   * structurally required from the first event onward).
   */
  recommendation_shown: ModelVersionTag & {
    is_experiment: boolean;
  };
  /**
   * UC-03 / NFR-P1 (P6): one per plan-request round trip, with the client-measured end-to-end
   * time (push → edge function → mirrored). `outcome` separates the NFR-R2 fallback from the
   * study's arm A so outage days are identifiable (File 06 exclusion rule).
   */
  plan_requested: {
    trigger: 'first_open' | 'new_day' | 'manual' | 'evening_ritual';
    outcome: 'learned' | 'arm_a' | 'fallback' | 'empty_inbox' | 'no_working_window' | 'error';
    duration_ms: number;
    engine: 'learned' | 'heuristic' | null;
    model_version: string | null;
  };
  /** FR-02 funnel (P4). Steps only — never answers, scores, or emails. */
  onboarding_step_completed: {
    step: 'welcome' | 'survey' | 'hours' | 'categories' | 'seed_tasks';
  };
  /** FR-02/UC-01 (P4). Class is a behavioral enum, not user text (NFR-S2 rule above). */
  onboarding_completed: {
    survey_skipped: boolean;
    chronotype_class: 'DM' | 'MM' | 'INT' | 'ME' | 'DE';
    top_categories_count: number;
    seed_tasks_added: number;
  };
  /**
   * P7 block actions on a recommendation (FR-23/25/30, UC-04/06/07) — recommendation-lifecycle
   * events, so the NFR-O1 tag is required. `did_it` = UC-04 A1 correction.
   */
  block_action: ModelVersionTag & {
    action: 'start' | 'done' | 'skip' | 'move' | 'did_it';
    is_experiment: boolean;
  };
  /** FR-30 (P7): duration telemetry — minutes only, never task text. */
  focus_session_ended: {
    outcome: 'finished' | 'abandoned';
    focused_minutes: number;
    planned_minutes: number;
  };
  /** FR-31 (P7): the rating happened (values stay in `events`; PostHog sees the shape only). */
  session_rated: {
    energy: 1 | 2 | 3;
    has_difficulty: boolean;
  };
  /** UC-04 A2 (P7). */
  skip_diagnostic: {
    answer: 'too_big' | 'wrong_time' | 'not_important';
  };
  /** NFR-R1 (P8): one per sync round trip — counts and timing only. */
  sync_completed: {
    reason: 'foreground' | 'write' | 'reconnect' | 'poll' | 'manual' | 'sign_in' | 'pre_plan';
    outcome: 'synced' | 'skipped' | 'no-session' | 'offline' | 'busy' | 'failed';
    pushed: number;
    pulled: number;
    conflicts: number;
    duration_ms: number;
  };
  /** FR-03 (P8): calendar connection lifecycle — never calendar content. */
  gcal_connection: {
    event:
      | 'connect_started'
      | 'connected'
      | 'write_back_started'
      | 'write_back_on'
      | 'write_back_off'
      | 'disconnected'
      | 'failed';
  };
  /** FR-41/FR-33 (P9): a belief toggle — the cell it names is categorical (NFR-S3). */
  belief_labeled: {
    label: 'correct' | 'incorrect' | 'none';
    category: 'deep' | 'admin' | 'physical' | 'learning';
    daypart: 'EM' | 'MO' | 'MD' | 'AF' | 'EV' | 'NT';
    day_type: 'weekday' | 'weekend';
    surface: 'beliefs' | 'review' | 'picker';
  };
  /** FR-24/UC-05 (P9): the trade-off sheet decision; `rank` = position of the chosen option. */
  tradeoff_decided: {
    outcome: 'chosen' | 'rejected_all';
    kind: 'drop' | 'shrink' | 'move_past_deadline' | 'unpin' | null;
    rank: number | null;
    options: number;
  };
  /** UC-08 (P9): the weekly review was closed with N learnings shown. */
  weekly_review_completed: {
    week: string;
    learnings: number;
    labels_set: number;
    trend: 'up' | 'down' | 'flat' | null;
  };
  /** FR-40/41 (P9): the tab rendered — from the network or from the MMKV cache. */
  insights_viewed: {
    source: 'network' | 'cache' | 'empty';
    learning_mode: boolean | null;
  };
  /** FR-01 (P4). No identifiers — method and lifecycle only. */
  auth_event: {
    method: 'anonymous' | 'magic_link' | 'google';
    event: 'signed_in' | 'signed_out' | 'conversion_started' | 'converted';
  };
  /**
   * FR-50 (P10, ADR-0014 §1–§2): one per scheduler run — how many local notifications were
   * asked for and why the rest were not. Counts only; never a title.
   */
  notifications_planned: {
    scheduled: number;
    capped: number;
    muted: number;
    past: number;
    reason: 'ok' | 'no_permission';
    /** FR-50 on Android 12+: whether the OS delivers the schedule exactly (build 6). */
    exact: 'allowed' | 'denied' | 'not_applicable' | 'unavailable';
  };
  /** FR-50 (build 6): the exact-alarm card / Settings row — the user opened the OS screen or declined. */
  exact_alarm_prompt: { action: 'open_settings' | 'dismiss'; source: 'today_card' | 'settings' };
  /** FR-32/FR-50 (P10): the user acted on a local notification (the fact is the `events` row). */
  notification_opened: {
    kind: 'block_reminder' | 'evening_ritual';
    action: 'open' | 'accept' | 'adjust';
    variant: 'daily' | 'sunday' | null;
  };
  /** FR-50 (P10): the OS permission prompt outcome from the Today card or Settings. */
  reminders_permission: { granted: boolean; source: 'today_card' | 'settings' };
  /** FR-42 (P10): the export document was fetched and handed to the share sheet. */
  data_exported: { tables: number; truncated: boolean };
  /** FR-42 (P10): erasure confirmed by the server (the last event this install ever sends). */
  account_deleted: { had_calendar: boolean };
  /** ADR-0014 §12 (P10): an SDK opt-out toggled — the last analytics event before opting out. */
  privacy_toggled: { sdk: 'analytics' | 'crash_reports'; enabled: boolean };
};

export type AnalyticsEventName = keyof AnalyticsEvents;
