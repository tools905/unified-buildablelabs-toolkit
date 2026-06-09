export type WorkspaceRole = "admin" | "member";
export type ProjectStatus = "draft" | "active" | "completed" | "archived";
export type ReviewCadence = "weekly" | "biweekly" | "final_only" | "custom";
export type ReviewRoundStatus =
  | "planned"
  | "active"
  | "completed"
  | "closed"
  | "cancelled";
export type ReviewAssignmentStatus =
  | "pending"
  | "submitted"
  | "overdue"
  | "skipped";
export type NotificationType =
  | "invite"
  | "round_started"
  | "review_reminder"
  | "overdue_reminder"
  | "admin_overdue_summary"
  | "report_ready";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: WorkspaceRole;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_members"]["Insert"]>;
      };
      invites: {
        Row: {
          id: string;
          workspace_id: string;
          email: string;
          role: WorkspaceRole;
          token: string;
          status: string;
          invited_by: string;
          accepted_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          email: string;
          role?: WorkspaceRole;
          token: string;
          status?: string;
          invited_by: string;
          accepted_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invites"]["Insert"]>;
      };
      projects: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          status: ProjectStatus;
          cadence: ReviewCadence;
          reviews_per_person: number;
          review_due_hours: number;
          start_date: string;
          end_date: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          cadence?: ReviewCadence;
          reviews_per_person?: number;
          review_due_hours?: number;
          start_date: string;
          end_date: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          role_label: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          role_label?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_members"]["Insert"]>;
      };
      review_rounds: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          round_number: number;
          scheduled_start_at: string;
          due_at: string;
          status: ReviewRoundStatus;
          started_at: string | null;
          completed_at: string | null;
          closed_at: string | null;
          created_at: string;
          ai_overall_summary: string | null;
          ai_member_summaries: Json | null;
          ai_role_weights: Json | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          round_number: number;
          scheduled_start_at: string;
          due_at: string;
          status?: ReviewRoundStatus;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          ai_overall_summary?: string | null;
          ai_member_summaries?: Json | null;
          ai_role_weights?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["review_rounds"]["Insert"]>;
      };
      review_assignments: {
        Row: {
          id: string;
          round_id: string;
          reviewer_id: string;
          reviewee_id: string;
          status: ReviewAssignmentStatus;
          reminder_count: number;
          last_reminded_at: string | null;
          submitted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          reviewer_id: string;
          reviewee_id: string;
          status?: ReviewAssignmentStatus;
          reminder_count?: number;
          last_reminded_at?: string | null;
          submitted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["review_assignments"]["Insert"]>;
      };
      review_responses: {
        Row: {
          id: string;
          assignment_id: string;
          strengths: string;
          improvements: string;
          communication_rating: number;
          reliability_rating: number;
          ownership_rating: number;
          execution_quality_rating: number | null;
          collaboration_rating: number | null;
          technical_quality_rating: number | null;
          problem_solving_rating: number | null;
          leadership_rating: number | null;
          system_design_rating: number | null;
          learning_growth_rating: number | null;
          specific_example: string;
          private_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["review_responses"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["review_responses"]["Insert"]>;
      };
      notification_logs: {
        Row: {
          id: string;
          workspace_id: string | null;
          project_id: string | null;
          round_id: string | null;
          assignment_id: string | null;
          recipient_email: string;
          type: NotificationType;
          status: string;
          provider_message_id: string | null;
          error_message: string | null;
          sent_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["notification_logs"]["Row"], "id" | "sent_at"> & {
          id?: string;
          sent_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_logs"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          workspace_id: string | null;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_workspace_member: {
        Args: { target_workspace_id: string; target_user_id: string };
        Returns: boolean;
      };
      is_workspace_admin: {
        Args: { target_workspace_id: string; target_user_id: string };
        Returns: boolean;
      };
      is_project_member: {
        Args: { target_project_id: string; target_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      workspace_role: WorkspaceRole;
      project_status: ProjectStatus;
      review_cadence: ReviewCadence;
      review_round_status: ReviewRoundStatus;
      review_assignment_status: ReviewAssignmentStatus;
      notification_type: NotificationType;
    };
  };
};
