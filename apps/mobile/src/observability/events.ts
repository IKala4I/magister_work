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
  /** FR-01 (P4). No identifiers — method and lifecycle only. */
  auth_event: {
    method: 'anonymous' | 'magic_link' | 'google';
    event: 'signed_in' | 'signed_out' | 'conversion_started' | 'converted';
  };
};

export type AnalyticsEventName = keyof AnalyticsEvents;
