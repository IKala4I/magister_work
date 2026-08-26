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
};

export type AnalyticsEventName = keyof AnalyticsEvents;
