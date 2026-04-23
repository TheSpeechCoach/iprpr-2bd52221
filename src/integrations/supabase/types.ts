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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_logs: {
        Row: {
          created_at: string
          event: string
          id: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      interview_questions: {
        Row: {
          answer_framework: string | null
          category: string
          created_at: string
          difficulty: string | null
          follow_up: string | null
          id: string
          note: string | null
          position: number
          practised: boolean
          question: string
          session_id: string
          starred: boolean
          user_id: string
          what_good_covers: string | null
          why_matters: string | null
        }
        Insert: {
          answer_framework?: string | null
          category: string
          created_at?: string
          difficulty?: string | null
          follow_up?: string | null
          id?: string
          note?: string | null
          position: number
          practised?: boolean
          question: string
          session_id: string
          starred?: boolean
          user_id: string
          what_good_covers?: string | null
          why_matters?: string | null
        }
        Update: {
          answer_framework?: string | null
          category?: string
          created_at?: string
          difficulty?: string | null
          follow_up?: string | null
          id?: string
          note?: string | null
          position?: number
          practised?: boolean
          question?: string
          session_id?: string
          starred?: boolean
          user_id?: string
          what_good_covers?: string | null
          why_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "prep_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempts: {
        Row: {
          confidence: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          question_id: string
          self_rating: number | null
          text_answer: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          question_id: string
          self_rating?: number | null
          text_answer?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          question_id?: string
          self_rating?: number | null
          text_answer?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_sessions: {
        Row: {
          candidate_current_role: string | null
          candidate_notes: string | null
          candidate_summary: string | null
          company_name: string | null
          country: string | null
          created_at: string
          cv_file_path: string | null
          cv_text: string | null
          difficulty: string
          extracted_job_summary: Json | null
          focus_mix: Json
          full_name: string | null
          id: string
          include_answer_angles: boolean
          include_followups: boolean
          include_rubric: boolean
          interview_style: string | null
          interview_type: string | null
          job_description: string | null
          job_spec_url: string | null
          job_title: string | null
          linkedin_text: string | null
          linkedin_url: string | null
          num_questions: number
          output_tone: string | null
          red_flags: Json | null
          role_summary: string | null
          seniority_level: string | null
          status: string
          target_industry: string | null
          target_role: string | null
          title: string
          top_themes: Json | null
          updated_at: string
          user_id: string
          years_experience: string | null
        }
        Insert: {
          candidate_current_role?: string | null
          candidate_notes?: string | null
          candidate_summary?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          cv_file_path?: string | null
          cv_text?: string | null
          difficulty?: string
          extracted_job_summary?: Json | null
          focus_mix?: Json
          full_name?: string | null
          id?: string
          include_answer_angles?: boolean
          include_followups?: boolean
          include_rubric?: boolean
          interview_style?: string | null
          interview_type?: string | null
          job_description?: string | null
          job_spec_url?: string | null
          job_title?: string | null
          linkedin_text?: string | null
          linkedin_url?: string | null
          num_questions?: number
          output_tone?: string | null
          red_flags?: Json | null
          role_summary?: string | null
          seniority_level?: string | null
          status?: string
          target_industry?: string | null
          target_role?: string | null
          title: string
          top_themes?: Json | null
          updated_at?: string
          user_id: string
          years_experience?: string | null
        }
        Update: {
          candidate_current_role?: string | null
          candidate_notes?: string | null
          candidate_summary?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          cv_file_path?: string | null
          cv_text?: string | null
          difficulty?: string
          extracted_job_summary?: Json | null
          focus_mix?: Json
          full_name?: string | null
          id?: string
          include_answer_angles?: boolean
          include_followups?: boolean
          include_rubric?: boolean
          interview_style?: string | null
          interview_type?: string | null
          job_description?: string | null
          job_spec_url?: string | null
          job_title?: string | null
          linkedin_text?: string | null
          linkedin_url?: string | null
          num_questions?: number
          output_tone?: string | null
          red_flags?: Json | null
          role_summary?: string | null
          seniority_level?: string | null
          status?: string
          target_industry?: string | null
          target_role?: string | null
          title?: string
          top_themes?: Json | null
          updated_at?: string
          user_id?: string
          years_experience?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
