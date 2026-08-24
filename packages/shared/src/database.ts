export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
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
          requested_at: string
          user_hash: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          requested_at?: string
          user_hash: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          requested_at?: string
          user_hash?: string
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
          excluded: boolean
          excluded_reason: string | null
          features: Json
          id: string
          kind: string
          reason: string
          recommendation_id: string
          reward: number
          user_id: string
        }
        Insert: {
          attributed_at?: string
          category: string
          corrected_at?: string | null
          excluded?: boolean
          excluded_reason?: string | null
          features: Json
          id?: string
          kind: string
          reason: string
          recommendation_id: string
          reward: number
          user_id: string
        }
        Update: {
          attributed_at?: string
          category?: string
          corrected_at?: string | null
          excluded?: boolean
          excluded_reason?: string | null
          features?: Json
          id?: string
          kind?: string
          reason?: string
          recommendation_id?: string
          reward?: number
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
          channel_expires_at: string | null
          channel_id: string | null
          resource_id: string | null
          sync_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_expires_at?: string | null
          channel_id?: string | null
          resource_id?: string | null
          sync_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_expires_at?: string | null
          channel_id?: string | null
          resource_id?: string | null
          sync_token?: string | null
          updated_at?: string
          user_id?: string
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
      [_ in never]: never
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
