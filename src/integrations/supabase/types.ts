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
  public: {
    Tables: {
      app_settings: {
        Row: {
          connection_status: string
          created_at: string
          evolution_api_key: string | null
          evolution_instance: string | null
          evolution_url: string | null
          id: string
          last_error: string | null
          last_sent_at: string | null
          singleton: boolean
          test_phone: string | null
          updated_at: string
        }
        Insert: {
          connection_status?: string
          created_at?: string
          evolution_api_key?: string | null
          evolution_instance?: string | null
          evolution_url?: string | null
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          singleton?: boolean
          test_phone?: string | null
          updated_at?: string
        }
        Update: {
          connection_status?: string
          created_at?: string
          evolution_api_key?: string | null
          evolution_instance?: string | null
          evolution_url?: string | null
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          singleton?: boolean
          test_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      areas: {
        Row: {
          active: boolean
          color: string
          created_at: string
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      courier_payments: {
        Row: {
          courier_id: string | null
          created_at: string
          daily_amount: number
          deleted_at: string | null
          deliveries: number
          fees_amount: number
          id: string
          notes: string | null
          paid_at: string | null
          pix_key: string | null
          receipt_url: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["payment_state"]
          updated_at: string
          work_date: string
        }
        Insert: {
          courier_id?: string | null
          created_at?: string
          daily_amount?: number
          deleted_at?: string | null
          deliveries?: number
          fees_amount?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          pix_key?: string | null
          receipt_url?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
          work_date: string
        }
        Update: {
          courier_id?: string | null
          created_at?: string
          daily_amount?: number
          deleted_at?: string | null
          deliveries?: number
          fees_amount?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          pix_key?: string | null
          receipt_url?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_payments_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_payments_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          default_daily_rate: number
          id: string
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_daily_rate?: number
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_daily_rate?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          daily_rate: number
          id: string
          is_partner: boolean
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_rate?: number
          id?: string
          is_partner?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_rate?: number
          id?: string
          is_partner?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          created_at: string
          dedupe_key: string | null
          error: string | null
          id: string
          message: string | null
          phone: string | null
          recipient_name: string | null
          sent_at: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          message?: string | null
          phone?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          message?: string | null
          phone?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          active: boolean
          body: string
          created_at: string
          id: string
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          id?: string
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          is_partner: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string
          id: string
          is_partner?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_partner?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schedule_entries: {
        Row: {
          created_at: string
          daily_rate: number
          day_index: number
          employee_id: string
          id: string
          notes: string | null
          occurrence: Database["public"]["Enums"]["day_occurrence"]
          periods: Json
          updated_at: string
          week_id: string
        }
        Insert: {
          created_at?: string
          daily_rate?: number
          day_index: number
          employee_id: string
          id?: string
          notes?: string | null
          occurrence?: Database["public"]["Enums"]["day_occurrence"]
          periods?: Json
          updated_at?: string
          week_id: string
        }
        Update: {
          created_at?: string
          daily_rate?: number
          day_index?: number
          employee_id?: string
          id?: string
          notes?: string | null
          occurrence?: Database["public"]["Enums"]["day_occurrence"]
          periods?: Json
          updated_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "schedule_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_weeks: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string
          id: string
          notes: string | null
          order_date: string | null
          paid_at: string | null
          payment_detail: string | null
          payment_method: string | null
          receipt_url: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["payment_state"]
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          notes?: string | null
          order_date?: string | null
          paid_at?: string | null
          payment_detail?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          order_date?: string | null
          paid_at?: string | null
          payment_detail?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          category: string | null
          contact_name: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string
          done: boolean
          id: string
          label: string
          position: number
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          label: string
          position?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          label?: string
          position?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          task_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          task_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area: string | null
          board: Database["public"]["Enums"]["task_board"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          employee_id: string | null
          id: string
          instructions: string | null
          not_done_reason: string | null
          observations: string | null
          owner_id: string | null
          participants: string[]
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          board?: Database["public"]["Enums"]["task_board"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          instructions?: string | null
          not_done_reason?: string | null
          observations?: string | null
          owner_id?: string | null
          participants?: string[]
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          status: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          board?: Database["public"]["Enums"]["task_board"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          instructions?: string | null
          not_done_reason?: string | null
          observations?: string | null
          owner_id?: string | null
          participants?: string[]
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      is_internal: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "master_admin" | "partner"
      day_occurrence:
        | "trabalho"
        | "folga"
        | "falta_justificada_previa"
        | "falta_justificada_posterior"
        | "falta_nao_justificada"
      payment_state: "pendente" | "pago" | "cancelado"
      task_board: "socios" | "colaboradores"
      task_priority: "baixa" | "media" | "alta" | "urgente"
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
      app_role: ["master_admin", "partner"],
      day_occurrence: [
        "trabalho",
        "folga",
        "falta_justificada_previa",
        "falta_justificada_posterior",
        "falta_nao_justificada",
      ],
      payment_state: ["pendente", "pago", "cancelado"],
      task_board: ["socios", "colaboradores"],
      task_priority: ["baixa", "media", "alta", "urgente"],
    },
  },
} as const
