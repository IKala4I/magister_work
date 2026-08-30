export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bandit_state: {
        Row: {
          a_matrix: number[]
          b_vector: number[]
          category: string
          d: number
          state_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          a_matrix: number[]
          b_vector: number[]
          category: string
          d: number
          state_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          a_matrix?: number[]
          b_vector?: number[]
          category?: string
          d?: number
          state_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      belief_labels: {
        Row: {
          category: string
          created_at: string
          day_type: string
          daypart: string
          delivered_at: string | null
          id: string
          label: string
          labeled_at: string
          source: string
          state_ref: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          day_type: string
          daypart: string
          delivered_at?: string | null
          id: string
          label: string
          labeled_at: string
          source?: string
          state_ref: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          day_type?: string
          daypart?: string
          delivered_at?: string | null
          id?: string
          label?: string
          labeled_at?: string
          source?: string
          state_ref?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_cells: {
        Row: {
          alpha0: number
          beta0: number
          category: string
          day_type: string
          daypart: string
          fail: number
          last_event_at: string | null
          prior_version: number
          succ: number
          updated_at: string
          user_id: string
        }
        Insert: {
          alpha0: number
          beta0: number
          category: string
          day_type: string
          daypart: string
          fail?: number
          last_event_at?: string | null
          prior_version: number
          succ?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          alpha0?: number
          beta0?: number
          category?: string
          day_type?: string
          daypart?: string
          fail?: number
          last_event_at?: string | null
          prior_version?: number
          succ?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blend_state: {
        Row: {
          state_version: number
          updated_at: string
          user_id: string
          w_bandit: number
          w_energy: number
        }
        Insert: {
          state_version?: number
          updated_at?: string
          user_id: string
          w_bandit?: number
          w_energy?: number
        }
        Update: {
          state_version?: number
          updated_at?: string
          user_id?: string
          w_bandit?: number
          w_energy?: number
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          busy: boolean
          deleted_at: string | null
          end_at: string
          external_id: string
          id: string
          server_seq: number | null
          source: string
          start_at: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          busy?: boolean
          deleted_at?: string | null
          end_at: string
          external_id: string
          id?: string
          server_seq?: number | null
          source?: string
          start_at: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          busy?: boolean
          deleted_at?: string | null
          end_at?: string
          external_id?: string
          id?: string
          server_seq?: number | null
          source?: string
          start_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cluster_assignments: {
        Row: {
          assigned_at: string
          cluster_id: number
          method: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          cluster_id: number
          method: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          cluster_id?: number
          method?: string
          user_id?: string
        }
        Relationships: []
      }
      deletion_audit: {
        Row: {
          completed_at: string | null
          id: string
          reason: string
          requested_at: string
          user_hash: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          reason?: string
          requested_at?: string
          user_hash: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          reason?: string
          requested_at?: string
          user_hash?: string
        }
        Relationships: []
      }
      duration_estimates: {
        Row: {
          category: string
          ewma_ratio: number
          last_session_at: string | null
          n: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          ewma_ratio: number
          last_session_at?: string | null
          n?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          ewma_ratio?: number
          last_session_at?: string | null
          n?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          client_ts: string
          context: Json
          id: number
          local_day: string
          op_id: string
          payload: Json
          recommendation_id: string | null
          server_ts: string
          task_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          client_ts: string
          context?: Json
          id?: never
          local_day: string
          op_id: string
          payload?: Json
          recommendation_id?: string | null
          server_ts?: string
          task_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          client_ts?: string
          context?: Json
          id?: never
          local_day?: string
          op_id?: string
          payload?: Json
          recommendation_id?: string | null
          server_ts?: string
          task_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_rewards: {
        Row: {
          attributed_at: string
          category: string
          corrected_at: string | null
          delivered_at: string | null
          excluded: boolean
          excluded_reason: string | null
          features: Json
          id: string
          kind: string
          reason: string
          recommendation_id: string
          reward: number
          source: string
          user_id: string
        }
        Insert: {
          attributed_at?: string
          category: string
          corrected_at?: string | null
          delivered_at?: string | null
          excluded?: boolean
          excluded_reason?: string | null
          features: Json
          id?: string
          kind: string
          reason: string
          recommendation_id: string
          reward: number
          source?: string
          user_id: string
        }
        Update: {
          attributed_at?: string
          category?: string
          corrected_at?: string | null
          delivered_at?: string | null
          excluded?: boolean
          excluded_reason?: string | null
          features?: Json
          id?: string
          kind?: string
          reason?: string
          recommendation_id?: string
          reward?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_rewards_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      gcal_sync_state: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          calendar_id: string
          channel_expires_at: string | null
          channel_id: string | null
          channel_token: string | null
          confirm_token: string | null
          confirm_token_expires_at: string | null
          confirmed_at: string | null
          connected_at: string | null
          last_error: string | null
          last_synced_at: string | null
          oauth_state: string | null
          oauth_state_expires_at: string | null
          refresh_token: string | null
          resource_id: string | null
          scope: string
          sync_token: string | null
          updated_at: string
          user_id: string
          write_back: boolean
          write_back_calendar_id: string | null
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          calendar_id?: string
          channel_expires_at?: string | null
          channel_id?: string | null
          channel_token?: string | null
          confirm_token?: string | null
          confirm_token_expires_at?: string | null
          confirmed_at?: string | null
          connected_at?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          refresh_token?: string | null
          resource_id?: string | null
          scope?: string
          sync_token?: string | null
          updated_at?: string
          user_id: string
          write_back?: boolean
          write_back_calendar_id?: string | null
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          calendar_id?: string
          channel_expires_at?: string | null
          channel_id?: string | null
          channel_token?: string | null
          confirm_token?: string | null
          confirm_token_expires_at?: string | null
          confirmed_at?: string | null
          connected_at?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          refresh_token?: string | null
          resource_id?: string | null
          scope?: string
          sync_token?: string | null
          updated_at?: string
          user_id?: string
          write_back?: boolean
          write_back_calendar_id?: string | null
        }
        Relationships: []
      }
      model_registry: {
        Row: {
          artifact_uri: string | null
          created_at: string
          id: string
          kind: string
          metrics: Json
          promoted: boolean
          version: string
        }
        Insert: {
          artifact_uri?: string | null
          created_at?: string
          id?: string
          kind: string
          metrics?: Json
          promoted?: boolean
          version: string
        }
        Update: {
          artifact_uri?: string | null
          created_at?: string
          id?: string
          kind?: string
          metrics?: Json
          promoted?: boolean
          version?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          arm: string | null
          engine: string
          generated_at: string
          horizon: string
          id: string
          model_version: string | null
          plan_date: string
          server_seq: number | null
          solver_status: string | null
          telemetry: Json
          user_id: string
        }
        Insert: {
          arm?: string | null
          engine: string
          generated_at?: string
          horizon?: string
          id?: string
          model_version?: string | null
          plan_date: string
          server_seq?: number | null
          solver_status?: string | null
          telemetry?: Json
          user_id: string
        }
        Update: {
          arm?: string | null
          engine?: string
          generated_at?: string
          horizon?: string
          id?: string
          model_version?: string | null
          plan_date?: string
          server_seq?: number | null
          solver_status?: string | null
          telemetry?: Json
          user_id?: string
        }
        Relationships: []
      }
      prior_cells: {
        Row: {
          category: string
          chronotype_class: string
          day_type: string
          daypart: string
          mu0: number
          n0: number
          version: number
        }
        Insert: {
          category: string
          chronotype_class: string
          day_type: string
          daypart: string
          mu0: number
          n0: number
          version: number
        }
        Update: {
          category?: string
          chronotype_class?: string
          day_type?: string
          daypart?: string
          mu0?: number
          n0?: number
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          chronotype_class: string | null
          eu_eea_resident: boolean | null
          locale: string
          onboarding_completed_at: string | null
          research_cohort: boolean
          rmeq_score: number | null
          server_seq: number | null
          settings: Json
          sleep_window: Json
          survey_skipped: boolean
          timezone: string
          top_categories: string[]
          updated_at: string
          user_id: string
          version: number
          working_hours: Json
        }
        Insert: {
          chronotype_class?: string | null
          eu_eea_resident?: boolean | null
          locale?: string
          onboarding_completed_at?: string | null
          research_cohort?: boolean
          rmeq_score?: number | null
          server_seq?: number | null
          settings?: Json
          sleep_window?: Json
          survey_skipped?: boolean
          timezone?: string
          top_categories?: string[]
          updated_at?: string
          user_id: string
          version?: number
          working_hours?: Json
        }
        Update: {
          chronotype_class?: string | null
          eu_eea_resident?: boolean | null
          locale?: string
          onboarding_completed_at?: string | null
          research_cohort?: boolean
          rmeq_score?: number | null
          server_seq?: number | null
          settings?: Json
          sleep_window?: Json
          survey_skipped?: boolean
          timezone?: string
          top_categories?: string[]
          updated_at?: string
          user_id?: string
          version?: number
          working_hours?: Json
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          attributed_at: string | null
          chunk_index: number
          confidence: number | null
          conflict_flag: boolean
          context_bucket: string
          created_at: string
          engine: string
          features: Json
          gcal_event_id: string | null
          gcal_synced_slot_start: string | null
          id: string
          is_experiment: boolean
          model_version: string | null
          plan_id: string
          propensity: number | null
          q_hat: number | null
          rationale_key: string
          rationale_params: Json
          server_seq: number | null
          slot_end: string
          slot_start: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          attributed_at?: string | null
          chunk_index?: number
          confidence?: number | null
          conflict_flag?: boolean
          context_bucket: string
          created_at?: string
          engine: string
          features: Json
          gcal_event_id?: string | null
          gcal_synced_slot_start?: string | null
          id?: string
          is_experiment?: boolean
          model_version?: string | null
          plan_id: string
          propensity?: number | null
          q_hat?: number | null
          rationale_key: string
          rationale_params?: Json
          server_seq?: number | null
          slot_end: string
          slot_start: string
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          attributed_at?: string | null
          chunk_index?: number
          confidence?: number | null
          conflict_flag?: boolean
          context_bucket?: string
          created_at?: string
          engine?: string
          features?: Json
          gcal_event_id?: string | null
          gcal_synced_slot_start?: string | null
          id?: string
          is_experiment?: boolean
          model_version?: string | null
          plan_id?: string
          propensity?: number | null
          q_hat?: number | null
          rationale_key?: string
          rationale_params?: Json
          server_seq?: number | null
          slot_end?: string
          slot_start?: string
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      recsys_applied_tuples: {
        Row: {
          applied_at: string
          kind: string
          recommendation_id: string
          state_version: number
          user_id: string
        }
        Insert: {
          applied_at?: string
          kind: string
          recommendation_id: string
          state_version: number
          user_id: string
        }
        Update: {
          applied_at?: string
          kind?: string
          recommendation_id?: string
          state_version?: number
          user_id?: string
        }
        Relationships: []
      }
      study_assignments: {
        Row: {
          arm: string
          ends_on: string
          phase_no: number
          sequence: string
          starts_on: string
          user_id: string
        }
        Insert: {
          arm: string
          ends_on: string
          phase_no: number
          sequence: string
          starts_on: string
          user_id: string
        }
        Update: {
          arm?: string
          ends_on?: string
          phase_no?: number
          sequence?: string
          starts_on?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_leases: {
        Row: {
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          expires_at: string
          token: string
          user_id: string
        }
        Update: {
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_ops: {
        Row: {
          applied_at: string
          entity_id: string | null
          op_id: string
          op_type: string
          outcome: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          entity_id?: string | null
          op_id: string
          op_type: string
          outcome: string
          user_id: string
        }
        Update: {
          applied_at?: string
          entity_id?: string | null
          op_id?: string
          op_type?: string
          outcome?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          category: string
          created_at: string
          deadline: string | null
          deleted_at: string | null
          done_at: string | null
          earliest_start: string | null
          est_minutes: number
          id: string
          postpone_count: number
          recurrence: Json | null
          server_seq: number | null
          splittable: boolean
          status: string
          title: string
          updated_at: string
          user_id: string
          value: number
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          done_at?: string | null
          earliest_start?: string | null
          est_minutes: number
          id?: string
          postpone_count?: number
          recurrence?: Json | null
          server_seq?: number | null
          splittable?: boolean
          status?: string
          title: string
          updated_at?: string
          user_id: string
          value: number
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          done_at?: string | null
          earliest_start?: string | null
          est_minutes?: number
          id?: string
          postpone_count?: number
          recurrence?: Json | null
          server_seq?: number | null
          splittable?: boolean
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          value?: number
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_sync_lease: {
        Args: { p_ttl_seconds?: number; p_user_id: string }
        Returns: string
      }
      anonymous_purge_candidates: {
        Args: { p_days?: number; p_limit?: number; p_now?: string }
        Returns: {
          last_seen_at: string
          user_id: string
        }[]
      }
      attribution_due: {
        Args: { p_limit?: number; p_now?: string }
        Returns: {
          category: string
          conflict_flag: boolean
          context_bucket: string
          features: Json
          id: string
          local_day: string
          slot_end: string
          slot_start: string
          status: string
          task_id: string
          timezone: string
          user_id: string
        }[]
      }
      attribution_sweep_tick: { Args: never; Returns: string }
      chronotype_seed_cluster: { Args: { p_class: string }; Returns: number }
      gcal_sweep_tick: { Args: never; Returns: string }
      instantiate_user_priors: { Args: { p_user_id: string }; Returns: number }
      persist_plan: {
        Args: {
          p_plan: Json
          p_recs: Json
          p_supersede: string[]
          p_user_id: string
        }
        Returns: Json
      }
      release_sync_lease: {
        Args: { p_token: string; p_user_id: string }
        Returns: boolean
      }
      retention_sweep_tick: { Args: never; Returns: string }
      sync_apply_event: {
        Args: { p: Json; p_op_id: string; p_user_id: string }
        Returns: Json
      }
      sync_apply_profile: {
        Args: { p: Json; p_base: number; p_op_id: string; p_user_id: string }
        Returns: Json
      }
      sync_apply_rec_status: {
        Args: { p: Json; p_op_id: string; p_user_id: string }
        Returns: Json
      }
      sync_apply_task: {
        Args: {
          p: Json
          p_base: number
          p_delete: boolean
          p_op_id: string
          p_user_id: string
        }
        Returns: Json
      }
      sync_is_uuid: { Args: { p: string }; Returns: boolean }
      sync_pull: {
        Args: { p_cursor?: number; p_limit?: number }
        Returns: {
          payload: Json
          server_seq: number
          tbl: string
        }[]
      }
      sync_replay: { Args: { p_ops: Json; p_user_id: string }; Returns: Json }
      sync_ts: { Args: { p: Json }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
