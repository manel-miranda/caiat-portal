export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json;
          entity_id: string | null;
          entity_type: string;
          id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      cash_reconciliations: {
        Row: {
          business_date: string;
          closed_at: string;
          closed_by: string | null;
          counted_total: number;
          difference: number | null;
          expected_total: number;
          id: string;
          notes: string | null;
        };
        Insert: {
          business_date: string;
          closed_at?: string;
          closed_by?: string | null;
          counted_total?: number;
          difference?: number | null;
          expected_total?: number;
          id?: string;
          notes?: string | null;
        };
        Update: {
          business_date?: string;
          closed_at?: string;
          closed_by?: string | null;
          counted_total?: number;
          difference?: number | null;
          expected_total?: number;
          id?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      charges: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          label: string;
          notes: string | null;
          quantity: number;
          service_type_id: string | null;
          source_food_order_id: string | null;
          source_food_order_item_id: string | null;
          source_request_id: string | null;
          stay_id: string;
          total: number | null;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label: string;
          notes?: string | null;
          quantity?: number;
          service_type_id?: string | null;
          source_food_order_id?: string | null;
          source_food_order_item_id?: string | null;
          source_request_id?: string | null;
          stay_id: string;
          total?: number | null;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string;
          notes?: string | null;
          quantity?: number;
          service_type_id?: string | null;
          source_food_order_id?: string | null;
          source_food_order_item_id?: string | null;
          source_request_id?: string | null;
          stay_id?: string;
          total?: number | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "charges_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_source_food_order_id_fkey";
            columns: ["source_food_order_id"];
            isOneToOne: false;
            referencedRelation: "preview_food_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_source_food_order_item_id_fkey";
            columns: ["source_food_order_item_id"];
            isOneToOne: false;
            referencedRelation: "preview_food_order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_source_request_id_fkey";
            columns: ["source_request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_access_tokens: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          revoked_at: string | null;
          stay_id: string;
          token: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          stay_id: string;
          token: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          stay_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guest_access_tokens_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_catalog_events: {
        Row: {
          category: string | null;
          created_at: string;
          event_type: string;
          id: string;
          service_type_id: string | null;
          stay_id: string | null;
          subcategory: string | null;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          service_type_id?: string | null;
          stay_id?: string | null;
          subcategory?: string | null;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          service_type_id?: string | null;
          stay_id?: string | null;
          subcategory?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "guest_catalog_events_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guest_catalog_events_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
        ];
      };
      guests: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          nationality: string | null;
          notes: string | null;
          phone: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          nationality?: string | null;
          notes?: string | null;
          phone?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          nationality?: string | null;
          notes?: string | null;
          phone?: string | null;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          key: string;
          label: string;
          notes: string | null;
          preview_only: boolean;
          safety_stock: number;
          target_days: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key: string;
          label: string;
          notes?: string | null;
          preview_only?: boolean;
          safety_stock?: number;
          target_days?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key?: string;
          label?: string;
          notes?: string | null;
          preview_only?: boolean;
          safety_stock?: number;
          target_days?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          inventory_item_id: string;
          movement_type: string;
          notes: string | null;
          quantity: number;
          source_id: string | null;
          source_type: string;
          unit_cost: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inventory_item_id: string;
          movement_type: string;
          notes?: string | null;
          quantity: number;
          source_id?: string | null;
          source_type?: string;
          unit_cost?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inventory_item_id?: string;
          movement_type?: string;
          notes?: string | null;
          quantity?: number;
          source_id?: string | null;
          source_type?: string;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_status";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_recipe_components: {
        Row: {
          created_at: string;
          id: string;
          inventory_item_id: string;
          qty_per_portion: number;
          service_type_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          inventory_item_id: string;
          qty_per_portion: number;
          service_type_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          inventory_item_id?: string;
          qty_per_portion?: number;
          service_type_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_recipe_components_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_recipe_components_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_status";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_recipe_components_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_simulation_runs: {
        Row: {
          created_at: string;
          created_by: string | null;
          days: number;
          id: string;
          meals: number;
          scenario: string;
          summary: Json;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          days?: number;
          id?: string;
          meals?: number;
          scenario: string;
          summary?: Json;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          days?: number;
          id?: string;
          meals?: number;
          scenario?: string;
          summary?: Json;
        };
        Relationships: [];
      };
      payment_sessions: {
        Row: {
          amount_mad: number;
          capture_id: string | null;
          charged_amount: number;
          charged_currency: string;
          created_at: string;
          environment: string;
          error_code: string | null;
          fx_rate: number;
          guest_token: string;
          id: string;
          order_id: string | null;
          payment_id: string | null;
          provider: string;
          status: string;
          stay_id: string;
          updated_at: string;
        };
        Insert: {
          amount_mad: number;
          capture_id?: string | null;
          charged_amount: number;
          charged_currency: string;
          created_at?: string;
          environment?: string;
          error_code?: string | null;
          fx_rate: number;
          guest_token: string;
          id?: string;
          order_id?: string | null;
          payment_id?: string | null;
          provider?: string;
          status?: string;
          stay_id: string;
          updated_at?: string;
        };
        Update: {
          amount_mad?: number;
          capture_id?: string | null;
          charged_amount?: number;
          charged_currency?: string;
          created_at?: string;
          environment?: string;
          error_code?: string | null;
          fx_rate?: number;
          guest_token?: string;
          id?: string;
          order_id?: string | null;
          payment_id?: string | null;
          provider?: string;
          status?: string;
          stay_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_sessions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_sessions_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          created_at: string;
          external_reference: string | null;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes: string | null;
          provider: string | null;
          received_by: string | null;
          stay_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          external_reference?: string | null;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          provider?: string | null;
          received_by?: string | null;
          stay_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          external_reference?: string | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          provider?: string | null;
          received_by?: string | null;
          stay_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
        ];
      };
      preview_food_order_items: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          line_total: number;
          order_id: string;
          quantity: number;
          service_type_id: string;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          line_total?: number;
          order_id: string;
          quantity?: number;
          service_type_id: string;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          line_total?: number;
          order_id?: string;
          quantity?: number;
          service_type_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "preview_food_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "preview_food_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "preview_food_order_items_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
        ];
      };
      preview_food_orders: {
        Row: {
          billable: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          is_preview: boolean;
          notes: string | null;
          origin: string;
          status: string;
          stay_id: string;
          subtotal: number;
          timing: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          billable?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_preview?: boolean;
          notes?: string | null;
          origin?: string;
          status?: string;
          stay_id: string;
          subtotal?: number;
          timing?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          billable?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_preview?: boolean;
          notes?: string | null;
          origin?: string;
          status?: string;
          stay_id?: string;
          subtotal?: number;
          timing?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "preview_food_orders_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          username: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          full_name: string;
          id: string;
          phone?: string | null;
          username: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          username?: string;
        };
        Relationships: [];
      };
      purchase_lines: {
        Row: {
          created_at: string;
          id: string;
          inventory_item_id: string;
          line_total: number;
          purchase_id: string;
          quantity: number;
          unit_cost: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          inventory_item_id: string;
          line_total?: number;
          purchase_id: string;
          quantity: number;
          unit_cost?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          inventory_item_id?: string;
          line_total?: number;
          purchase_id?: string;
          quantity?: number;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_lines_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_lines_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_status";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "inventory_purchase_context";
            referencedColumns: ["purchase_id"];
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchase_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          line_count: number;
          notes: string | null;
          purchase_date: string;
          purchased_at: string;
          supplier_id: string | null;
          total_cost: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_count?: number;
          notes?: string | null;
          purchase_date?: string;
          purchased_at?: string;
          supplier_id?: string | null;
          total_cost?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_count?: number;
          notes?: string | null;
          purchase_date?: string;
          purchased_at?: string;
          supplier_id?: string | null;
          total_cost?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      requests: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string | null;
          created_via: string;
          id: string;
          label: string;
          notes: string | null;
          room_id: string | null;
          scheduled_at: string | null;
          service_type_id: string | null;
          status: Database["public"]["Enums"]["request_status"];
          stay_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_via?: string;
          id?: string;
          label: string;
          notes?: string | null;
          room_id?: string | null;
          scheduled_at?: string | null;
          service_type_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          stay_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_via?: string;
          id?: string;
          label?: string;
          notes?: string | null;
          room_id?: string | null;
          scheduled_at?: string | null;
          service_type_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          stay_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "requests_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          active: boolean;
          amenities: string[];
          base_price: number;
          breakfast_included: boolean;
          capacity: number;
          extra_guest_price: number;
          id: string;
          included_guests: number;
          name: string;
          number: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          amenities?: string[];
          base_price?: number;
          breakfast_included?: boolean;
          capacity?: number;
          extra_guest_price?: number;
          id?: string;
          included_guests?: number;
          name: string;
          number: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          amenities?: string[];
          base_price?: number;
          breakfast_included?: boolean;
          capacity?: number;
          extra_guest_price?: number;
          id?: string;
          included_guests?: number;
          name?: string;
          number?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      service_recommendations: {
        Row: {
          created_at: string;
          id: string;
          position: number;
          recommended_service_type_id: string;
          service_type_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position?: number;
          recommended_service_type_id: string;
          service_type_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position?: number;
          recommended_service_type_id?: string;
          service_type_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_recommendations_recommended_service_type_id_fkey";
            columns: ["recommended_service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_recommendations_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
        ];
      };
      service_types: {
        Row: {
          active: boolean;
          activity_mode: string | null;
          available_today: boolean;
          billable: boolean;
          category: string;
          created_at: string;
          default_price: number;
          description_i18n: Json;
          difficulty: string | null;
          display_order: number;
          featured: boolean;
          guest_category: string | null;
          guest_subcategory: string | null;
          guest_visible: boolean;
          id: string;
          key: string;
          label: string;
          name_i18n: Json;
          preview_only: boolean;
          requestable: boolean;
          short_description: string | null;
          signature: boolean;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          activity_mode?: string | null;
          available_today?: boolean;
          billable?: boolean;
          category?: string;
          created_at?: string;
          default_price?: number;
          description_i18n?: Json;
          difficulty?: string | null;
          display_order?: number;
          featured?: boolean;
          guest_category?: string | null;
          guest_subcategory?: string | null;
          guest_visible?: boolean;
          id?: string;
          key: string;
          label: string;
          name_i18n?: Json;
          preview_only?: boolean;
          requestable?: boolean;
          short_description?: string | null;
          signature?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          activity_mode?: string | null;
          available_today?: boolean;
          billable?: boolean;
          category?: string;
          created_at?: string;
          default_price?: number;
          description_i18n?: Json;
          difficulty?: string | null;
          display_order?: number;
          featured?: boolean;
          guest_category?: string | null;
          guest_subcategory?: string | null;
          guest_visible?: boolean;
          id?: string;
          key?: string;
          label?: string;
          name_i18n?: Json;
          preview_only?: boolean;
          requestable?: boolean;
          short_description?: string | null;
          signature?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      stays: {
        Row: {
          accommodation_total: number;
          check_in: string;
          check_out: string;
          checked_out_at: string | null;
          confirmation_status: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          created_by: string | null;
          guest_id: string;
          id: string;
          notes: string | null;
          num_guests: number;
          room_id: string;
          source: Database["public"]["Enums"]["stay_source"];
          status: Database["public"]["Enums"]["stay_status"];
        };
        Insert: {
          accommodation_total?: number;
          check_in: string;
          check_out: string;
          checked_out_at?: string | null;
          confirmation_status?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          guest_id: string;
          id?: string;
          notes?: string | null;
          num_guests?: number;
          room_id: string;
          source?: Database["public"]["Enums"]["stay_source"];
          status?: Database["public"]["Enums"]["stay_status"];
        };
        Update: {
          accommodation_total?: number;
          check_in?: string;
          check_out?: string;
          checked_out_at?: string | null;
          confirmation_status?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          guest_id?: string;
          id?: string;
          notes?: string | null;
          num_guests?: number;
          room_id?: string;
          source?: Database["public"]["Enums"]["stay_source"];
          status?: Database["public"]["Enums"]["stay_status"];
        };
        Relationships: [
          {
            foreignKeyName: "stays_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "guests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stays_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          location: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_permissions: {
        Row: {
          created_at: string;
          granted: boolean;
          id: string;
          permission: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted: boolean;
          id?: string;
          permission: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted?: boolean;
          id?: string;
          permission?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      inventory_purchase_context: {
        Row: {
          inventory_item_id: string | null;
          last_purchased_at: string | null;
          last_quantity: number | null;
          last_supplier_id: string | null;
          last_supplier_name: string | null;
          last_unit_cost: number | null;
          purchase_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_lines_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_lines_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_status";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["last_supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_status: {
        Row: {
          active: boolean | null;
          avg_daily_usage: number | null;
          days_remaining: number | null;
          estimated_stock: number | null;
          id: string | null;
          key: string | null;
          label: string | null;
          notes: string | null;
          preview_only: boolean | null;
          recommended_quantity: number | null;
          safety_stock: number | null;
          status: string | null;
          target_days: number | null;
          unit: string | null;
        };
        Relationships: [];
      };
      purchase_overview: {
        Row: {
          created_at: string | null;
          id: string | null;
          line_count: number | null;
          notes: string | null;
          purchase_date: string | null;
          purchased_at: string | null;
          supplier_id: string | null;
          supplier_name: string | null;
          total_cost: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      cancel_request: { Args: { p_request_id: string }; Returns: string };
      cash_reconcile: {
        Args: {
          p_business_date: string;
          p_counted_total: number;
          p_notes?: string;
        };
        Returns: {
          business_date: string;
          closed_at: string;
          closed_by: string | null;
          counted_total: number;
          difference: number | null;
          expected_total: number;
          id: string;
          notes: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "cash_reconciliations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      catalog_set_active: {
        Args: { p_active: boolean; p_id: string };
        Returns: string;
      };
      catalog_set_available: {
        Args: { p_available: boolean; p_id: string };
        Returns: string;
      };
      catalog_set_incoming_recommendations: {
        Args: { p_id: string; p_source_ids: string[] };
        Returns: number;
      };
      catalog_set_recommendations: {
        Args: { p_id: string; p_ids: string[] };
        Returns: number;
      };
      catalog_upsert_service: {
        Args: {
          p_active: boolean;
          p_activity_mode: string;
          p_billable: boolean;
          p_category: string;
          p_default_price: number;
          p_description_i18n?: Json;
          p_difficulty: string;
          p_display_order: number;
          p_featured: boolean;
          p_guest_category: string;
          p_guest_subcategory: string;
          p_guest_visible: boolean;
          p_id: string;
          p_key: string;
          p_label: string;
          p_name_i18n?: Json;
          p_requestable: boolean;
          p_short_description: string;
          p_signature: boolean;
          p_sort_order: number;
        };
        Returns: string;
      };
      checkout_stay: {
        Args: { p_override?: boolean; p_stay_id: string };
        Returns: number;
      };
      complete_request: {
        Args: { p_request_id: string; p_with_charge?: boolean };
        Returns: string;
      };
      confirm_reservation: { Args: { p_stay_id: string }; Returns: string };
      create_stay_with_guest: {
        Args: {
          p_accommodation_total: number;
          p_check_in: string;
          p_check_out: string;
          p_confirmation_status?: string;
          p_email?: string;
          p_guest_id?: string;
          p_guest_name: string;
          p_notes: string;
          p_num_guests: number;
          p_phone?: string;
          p_room_id: string;
          p_source: Database["public"]["Enums"]["stay_source"];
        };
        Returns: string;
      };
      customer_update_profile: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_guest_id: string;
          p_nationality: string;
          p_notes: string;
          p_phone: string;
        };
        Returns: string;
      };
      customer_upsert: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_nationality: string;
          p_notes: string;
          p_phone: string;
        };
        Returns: string;
      };
      edit_stay: {
        Args: {
          p_accommodation_total: number;
          p_check_in: string;
          p_check_out: string;
          p_guest_name: string;
          p_notes: string;
          p_num_guests: number;
          p_room_id: string;
          p_source: Database["public"]["Enums"]["stay_source"];
          p_stay_id: string;
        };
        Returns: string;
      };
      food_order_bill: { Args: { p_order_id: string }; Returns: number };
      guest_create_preview_food_order: {
        Args: {
          p_items: Json;
          p_notes?: string;
          p_timing?: string;
          p_token: string;
        };
        Returns: string;
      };
      guest_create_request: {
        Args: {
          p_custom_label: string;
          p_kind?: string;
          p_notes: string;
          p_service_type_id: string;
          p_token: string;
        };
        Returns: string;
      };
      guest_portal: { Args: { p_token: string }; Returns: Json };
      guest_stay_for_token: { Args: { p_token: string }; Returns: string };
      guest_token_generate: { Args: { p_stay_id: string }; Returns: string };
      guest_token_revoke: { Args: { p_stay_id: string }; Returns: undefined };
      has_permission: {
        Args: { _key: string; _user_id: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      inventory_adjust: {
        Args: { p_actual_quantity: number; p_item_id: string; p_notes: string };
        Returns: string;
      };
      inventory_consume_preview_order: {
        Args: { p_order_id: string };
        Returns: number;
      };
      inventory_receive: {
        Args: {
          p_item_id: string;
          p_notes: string;
          p_quantity: number;
          p_unit_cost: number;
        };
        Returns: string;
      };
      inventory_record_purchase: {
        Args: {
          p_lines: Json;
          p_notes: string;
          p_purchase_id: string;
          p_purchased_at: string;
          p_supplier_id: string;
        };
        Returns: string;
      };
      inventory_set_recipe: {
        Args: { p_components: Json; p_service_type_id: string };
        Returns: number;
      };
      inventory_simulate_history: {
        Args: { p_days?: number; p_run_id: string };
        Returns: Json;
      };
      inventory_simulate_purchase: {
        Args: { p_purchase_id: string };
        Returns: Json;
      };
      inventory_simulate_week: {
        Args: { p_run_id: string; p_scenario: string };
        Returns: Json;
      };
      inventory_simulation_reset: { Args: never; Returns: Json };
      inventory_upsert_item: {
        Args: {
          p_active: boolean;
          p_id: string;
          p_key: string;
          p_label: string;
          p_notes: string;
          p_preview_only: boolean;
          p_safety_stock: number;
          p_target_days: number;
          p_unit: string;
        };
        Returns: string;
      };
      inventory_upsert_supplier: {
        Args: {
          p_active: boolean;
          p_id: string;
          p_location: string;
          p_name: string;
          p_notes: string;
          p_phone: string;
        };
        Returns: string;
      };
      inventory_waste: {
        Args: { p_item_id: string; p_notes: string; p_quantity: number };
        Returns: string;
      };
      merge_customers: {
        Args: { p_keep_id: string; p_merge_id: string };
        Returns: string;
      };
      preview_food_order_set_status: {
        Args: { p_order_id: string; p_status: string };
        Returns: string;
      };
      reject_reservation: { Args: { p_stay_id: string }; Returns: string };
      role_default_permission: {
        Args: { _key: string; _role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      set_user_active: {
        Args: { p_active: boolean; p_user_id: string };
        Returns: undefined;
      };
      set_user_permission: {
        Args: { p_granted?: boolean; p_key: string; p_user_id: string };
        Returns: undefined;
      };
      set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"];
          p_user_id: string;
        };
        Returns: undefined;
      };
      staff_create_food_order: {
        Args: {
          p_items: Json;
          p_notes?: string;
          p_stay_id: string;
          p_timing?: string;
        };
        Returns: string;
      };
      supplier_set_active: {
        Args: { p_active: boolean; p_id: string };
        Returns: string;
      };
      supplier_upsert: {
        Args: {
          p_active: boolean;
          p_id: string;
          p_location: string;
          p_name: string;
          p_notes: string;
          p_phone: string;
        };
        Returns: string;
      };
    };
    Enums: {
      app_role: "admin" | "staff" | "supervisor";
      payment_method: "cash" | "card" | "bank_transfer" | "paypal";
      request_status: "pending" | "completed" | "cancelled";
      stay_source: "booking_com" | "whatsapp" | "phone" | "email" | "walk_in" | "other";
      stay_status: "active" | "completed" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "supervisor"],
      payment_method: ["cash", "card", "bank_transfer", "paypal"],
      request_status: ["pending", "completed", "cancelled"],
      stay_source: ["booking_com", "whatsapp", "phone", "email", "walk_in", "other"],
      stay_status: ["active", "completed", "cancelled"],
    },
  },
} as const;
