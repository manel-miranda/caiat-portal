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
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cash_reconciliations: {
        Row: {
          business_date: string
          closed_at: string
          closed_by: string | null
          counted_total: number
          difference: number | null
          expected_total: number
          id: string
          notes: string | null
        }
        Insert: {
          business_date: string
          closed_at?: string
          closed_by?: string | null
          counted_total?: number
          difference?: number | null
          expected_total?: number
          id?: string
          notes?: string | null
        }
        Update: {
          business_date?: string
          closed_at?: string
          closed_by?: string | null
          counted_total?: number
          difference?: number | null
          expected_total?: number
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      charges: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          notes: string | null
          quantity: number
          service_type_id: string | null
          stay_id: string
          total: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          notes?: string | null
          quantity?: number
          service_type_id?: string | null
          stay_id: string
          total?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          notes?: string | null
          quantity?: number
          service_type_id?: string | null
          stay_id?: string
          total?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "charges_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          nationality: string | null
          notes: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          notes?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          received_by: string | null
          stay_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_by?: string | null
          stay_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_by?: string | null
          stay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          phone: string | null
          username: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          username: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          username?: string
        }
        Relationships: []
      }
      requests: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          notes: string | null
          room_id: string | null
          scheduled_at: string | null
          service_type_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          stay_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          notes?: string | null
          room_id?: string | null
          scheduled_at?: string | null
          service_type_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          stay_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          notes?: string | null
          room_id?: string | null
          scheduled_at?: string | null
          service_type_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          stay_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean
          amenities: string[]
          base_price: number
          breakfast_included: boolean
          capacity: number
          extra_guest_price: number
          id: string
          included_guests: number
          name: string
          number: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          amenities?: string[]
          base_price?: number
          breakfast_included?: boolean
          capacity?: number
          extra_guest_price?: number
          id?: string
          included_guests?: number
          name: string
          number: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          amenities?: string[]
          base_price?: number
          breakfast_included?: boolean
          capacity?: number
          extra_guest_price?: number
          id?: string
          included_guests?: number
          name?: string
          number?: string
          sort_order?: number
        }
        Relationships: []
      }
      service_types: {
        Row: {
          active: boolean
          activity_mode: string | null
          billable: boolean
          category: string
          default_price: number
          difficulty: string | null
          id: string
          key: string
          label: string
          requestable: boolean
          sort_order: number
        }
        Insert: {
          active?: boolean
          activity_mode?: string | null
          billable?: boolean
          category?: string
          default_price?: number
          difficulty?: string | null
          id?: string
          key: string
          label: string
          requestable?: boolean
          sort_order?: number
        }
        Update: {
          active?: boolean
          activity_mode?: string | null
          billable?: boolean
          category?: string
          default_price?: number
          difficulty?: string | null
          id?: string
          key?: string
          label?: string
          requestable?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      stays: {
        Row: {
          accommodation_total: number
          check_in: string
          check_out: string
          checked_out_at: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          guest_id: string
          id: string
          notes: string | null
          num_guests: number
          room_id: string
          source: Database["public"]["Enums"]["stay_source"]
          status: Database["public"]["Enums"]["stay_status"]
        }
        Insert: {
          accommodation_total?: number
          check_in: string
          check_out: string
          checked_out_at?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          guest_id: string
          id?: string
          notes?: string | null
          num_guests?: number
          room_id: string
          source?: Database["public"]["Enums"]["stay_source"]
          status?: Database["public"]["Enums"]["stay_status"]
        }
        Update: {
          accommodation_total?: number
          check_in?: string
          check_out?: string
          checked_out_at?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          guest_id?: string
          id?: string
          notes?: string | null
          num_guests?: number
          room_id?: string
          source?: Database["public"]["Enums"]["stay_source"]
          status?: Database["public"]["Enums"]["stay_status"]
        }
        Relationships: [
          {
            foreignKeyName: "stays_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
      checkout_stay: {
        Args: { p_override?: boolean; p_stay_id: string }
        Returns: number
      }
      confirm_reservation: { Args: { p_stay_id: string }; Returns: string }
      create_stay_with_guest:
        | {
            Args: {
              p_accommodation_total: number
              p_check_in: string
              p_check_out: string
              p_guest_name: string
              p_notes: string
              p_num_guests: number
              p_room_id: string
              p_source: Database["public"]["Enums"]["stay_source"]
            }
            Returns: string
          }
        | {
            Args: {
              p_accommodation_total: number
              p_check_in: string
              p_check_out: string
              p_confirmation_status?: string
              p_guest_name: string
              p_notes: string
              p_num_guests: number
              p_room_id: string
              p_source: Database["public"]["Enums"]["stay_source"]
            }
            Returns: string
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reject_reservation: { Args: { p_stay_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "staff"
      payment_method: "cash" | "card" | "bank_transfer"
      request_status: "pending" | "completed" | "cancelled"
      stay_source:
        | "booking_com"
        | "whatsapp"
        | "phone"
        | "email"
        | "walk_in"
        | "other"
      stay_status: "active" | "completed" | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "staff"],
      payment_method: ["cash", "card", "bank_transfer"],
      request_status: ["pending", "completed", "cancelled"],
      stay_source: [
        "booking_com",
        "whatsapp",
        "phone",
        "email",
        "walk_in",
        "other",
      ],
      stay_status: ["active", "completed", "cancelled"],
    },
  },
} as const
