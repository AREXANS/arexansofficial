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
      admin_sessions: {
        Row: {
          device_id: string
          device_info: Json | null
          device_name: string | null
          id: string
          is_approved: boolean
          is_current: boolean
          login_time: string
        }
        Insert: {
          device_id: string
          device_info?: Json | null
          device_name?: string | null
          id?: string
          is_approved?: boolean
          is_current?: boolean
          login_time?: string
        }
        Update: {
          device_id?: string
          device_info?: Json | null
          device_name?: string | null
          id?: string
          is_approved?: boolean
          is_current?: boolean
          login_time?: string
        }
        Relationships: []
      }
      ads: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          link: string | null
          link_url: string | null
          media_type: string
          media_url: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          link?: string | null
          link_url?: string | null
          media_type?: string
          media_url: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          link?: string | null
          link_url?: string | null
          media_type?: string
          media_url?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      backgrounds: {
        Row: {
          background_type: string
          background_url: string
          created_at: string
          id: string
          is_active: boolean
          is_muted: boolean
          sort_order: number
          title: string
        }
        Insert: {
          background_type?: string
          background_url: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_muted?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          background_type?: string
          background_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_muted?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          ip_address: string
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          ip_address: string
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          ip_address?: string
          reason?: string | null
        }
        Relationships: []
      }
      developer_access_logs: {
        Row: {
          created_at: string
          device_id: string | null
          device_info: Json | null
          device_name: string | null
          event: string
          geo_info: Json | null
          id: string
          ip_address: string | null
          is_approved_device: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          device_info?: Json | null
          device_name?: string | null
          event?: string
          geo_info?: Json | null
          id?: string
          ip_address?: string | null
          is_approved_device?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          device_info?: Json | null
          device_name?: string | null
          event?: string
          geo_info?: Json | null
          id?: string
          ip_address?: string | null
          is_approved_device?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      duration_codes: {
        Row: {
          code: string
          created_at: string
          duration_days: number
          expires_at: string
          id: string
          is_active: boolean
          max_uses_per_key: number
          updated_at: string
          used_by: Json
        }
        Insert: {
          code: string
          created_at?: string
          duration_days?: number
          expires_at: string
          id?: string
          is_active?: boolean
          max_uses_per_key?: number
          updated_at?: string
          used_by?: Json
        }
        Update: {
          code?: string
          created_at?: string
          duration_days?: number
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses_per_key?: number
          updated_at?: string
          used_by?: Json
        }
        Relationships: []
      }
      lua_recording_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_public: boolean
          recording_id: string
          title: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          is_public?: boolean
          recording_id: string
          title: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_public?: boolean
          recording_id?: string
          title?: string
        }
        Relationships: []
      }
      lua_recordings: {
        Row: {
          created_at: string
          description: string | null
          duration_seconds: number | null
          game_id: string | null
          id: string
          is_public: boolean
          owner_hwid: string | null
          owner_key: string | null
          owner_username: string | null
          recording_data: Json
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          game_id?: string | null
          id?: string
          is_public?: boolean
          owner_hwid?: string | null
          owner_key?: string | null
          owner_username?: string | null
          recording_data?: Json
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          game_id?: string | null
          id?: string
          is_public?: boolean
          owner_hwid?: string | null
          owner_key?: string | null
          owner_username?: string | null
          recording_data?: Json
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lua_script_versions: {
        Row: {
          content: string
          created_at: string
          display_name: string | null
          id: string
          script_id: string
          version_number: number
        }
        Insert: {
          content: string
          created_at?: string
          display_name?: string | null
          id?: string
          script_id: string
          version_number: number
        }
        Update: {
          content?: string
          created_at?: string
          display_name?: string | null
          id?: string
          script_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "lua_script_versions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "lua_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      lua_scripts: {
        Row: {
          backup_content: string | null
          content: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          name: string
          raw_content: string | null
          script_type: string
          updated_at: string
        }
        Insert: {
          backup_content?: string | null
          content?: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          name: string
          raw_content?: string | null
          script_type?: string
          updated_at?: string
        }
        Update: {
          backup_content?: string | null
          content?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          name?: string
          raw_content?: string | null
          script_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      lua_teleports: {
        Row: {
          created_at: string
          description: string | null
          game_id: string | null
          id: string
          is_public: boolean
          owner_hwid: string | null
          owner_key: string | null
          owner_username: string | null
          source: string
          teleport_data: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          game_id?: string | null
          id?: string
          is_public?: boolean
          owner_hwid?: string | null
          owner_key?: string | null
          owner_username?: string | null
          source?: string
          teleport_data?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          game_id?: string | null
          id?: string
          is_public?: boolean
          owner_hwid?: string | null
          owner_key?: string | null
          owner_username?: string | null
          source?: string
          teleport_data?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      package_discounts: {
        Row: {
          created_at: string
          description: string | null
          discount_amount: number
          discount_percent: number
          discount_type: string
          duration_exact: boolean
          end_date: string | null
          id: string
          is_active: boolean
          max_days: number | null
          min_days: number | null
          notify_users: boolean
          package_name: string | null
          promo_code: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_amount?: number
          discount_percent?: number
          discount_type?: string
          duration_exact?: boolean
          end_date?: string | null
          id?: string
          is_active?: boolean
          max_days?: number | null
          min_days?: number | null
          notify_users?: boolean
          package_name?: string | null
          promo_code?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_amount?: number
          discount_percent?: number
          discount_type?: string
          duration_exact?: boolean
          end_date?: string | null
          id?: string
          is_active?: boolean
          max_days?: number | null
          min_days?: number | null
          notify_users?: boolean
          package_name?: string | null
          promo_code?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          features: string[] | null
          id: string
          is_active: boolean
          name: string
          price_per_day: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          features?: string[] | null
          id?: string
          is_active?: boolean
          name: string
          price_per_day?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          features?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          price_per_day?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      social_links: {
        Row: {
          created_at: string
          icon_type: string
          id: string
          is_active: boolean
          label: string
          link_location: string
          name: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          icon_type?: string
          id?: string
          is_active?: boolean
          label: string
          link_location?: string
          name: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          icon_type?: string
          id?: string
          is_active?: boolean
          label?: string
          link_location?: string
          name?: string
          sort_order?: number
          url?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          created_at: string
          customer_name: string
          customer_whatsapp: string | null
          device_id: string | null
          expires_at: string | null
          id: string
          ip_address: string | null
          license_key: string | null
          original_amount: number
          package_duration: number
          package_name: string
          paid_at: string | null
          qr_string: string | null
          status: string
          total_amount: number
          transaction_id: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_whatsapp?: string | null
          device_id?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          license_key?: string | null
          original_amount: number
          package_duration: number
          package_name: string
          paid_at?: string | null
          qr_string?: string | null
          status?: string
          total_amount: number
          transaction_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_whatsapp?: string | null
          device_id?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          license_key?: string | null
          original_amount?: number
          package_duration?: number
          package_name?: string
          paid_at?: string | null
          qr_string?: string | null
          status?: string
          total_amount?: number
          transaction_id?: string
        }
        Relationships: []
      }
      xcoins_balances: {
        Row: {
          balance: number
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          phone: string
          pin_hash: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          phone: string
          pin_hash: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string
          pin_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      xcoins_otp: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_used: boolean
          otp_code: string
          phone: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean
          otp_code: string
          phone: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          otp_code?: string
          phone?: string
        }
        Relationships: []
      }
      xcoins_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xcoins_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xcoins_balances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_db_storage_stats: { Args: never; Returns: Json }
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
    Enums: {},
  },
} as const
