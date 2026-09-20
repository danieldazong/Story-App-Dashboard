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
      activity_log: {
        Row: {
          actor_id: string
          book_id: string | null
          chapter_id: string | null
          created_at: string
          id: string
          message: string
        }
        Insert: {
          actor_id: string
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          message: string
        }
        Update: {
          actor_id?: string
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "chapters_needing_attention"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "activity_log_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters_needing_attention"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      app_settings: {
        Row: {
          accepted_audio_formats: string[]
          accepted_script_formats: string[]
          bucket_name: string
          default_chapter_access: Database["public"]["Enums"]["chapter_access"]
          default_maturity: Database["public"]["Enums"]["maturity"]
          detect_duration_automatically: boolean
          free_chapters_at_start: number
          id: boolean
          max_audio_size_mb: number
          public_cdn_domain: string
          storage_provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accepted_audio_formats?: string[]
          accepted_script_formats?: string[]
          bucket_name?: string
          default_chapter_access?: Database["public"]["Enums"]["chapter_access"]
          default_maturity?: Database["public"]["Enums"]["maturity"]
          detect_duration_automatically?: boolean
          free_chapters_at_start?: number
          id?: boolean
          max_audio_size_mb?: number
          public_cdn_domain?: string
          storage_provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accepted_audio_formats?: string[]
          accepted_script_formats?: string[]
          bucket_name?: string
          default_chapter_access?: Database["public"]["Enums"]["chapter_access"]
          default_maturity?: Database["public"]["Enums"]["maturity"]
          detect_duration_automatically?: boolean
          free_chapters_at_start?: number
          id?: boolean
          max_audio_size_mb?: number
          public_cdn_domain?: string
          storage_provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      books: {
        Row: {
          author: string
          cover_file_name: string | null
          cover_height: number | null
          cover_path: string | null
          cover_size_bytes: number | null
          cover_width: number | null
          created_at: string
          default_chapter_access: Database["public"]["Enums"]["chapter_access"]
          genres: string[]
          id: string
          maturity: Database["public"]["Enums"]["maturity"]
          short_description: string | null
          status: Database["public"]["Enums"]["book_status"]
          synopsis: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author: string
          cover_file_name?: string | null
          cover_height?: number | null
          cover_path?: string | null
          cover_size_bytes?: number | null
          cover_width?: number | null
          created_at?: string
          default_chapter_access?: Database["public"]["Enums"]["chapter_access"]
          genres?: string[]
          id?: string
          maturity?: Database["public"]["Enums"]["maturity"]
          short_description?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          synopsis?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          cover_file_name?: string | null
          cover_height?: number | null
          cover_path?: string | null
          cover_size_bytes?: number | null
          cover_width?: number | null
          created_at?: string
          default_chapter_access?: Database["public"]["Enums"]["chapter_access"]
          genres?: string[]
          id?: string
          maturity?: Database["public"]["Enums"]["maturity"]
          short_description?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          synopsis?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          access: Database["public"]["Enums"]["chapter_access"]
          audio_duration_seconds: number | null
          audio_duration_source:
            | Database["public"]["Enums"]["duration_source"]
            | null
          audio_file_name: string | null
          audio_path: string | null
          audio_size_bytes: number | null
          book_id: string
          created_at: string
          id: string
          number: number
          script_file_name: string | null
          script_path: string | null
          script_text: string | null
          title: string
          updated_at: string
        }
        Insert: {
          access?: Database["public"]["Enums"]["chapter_access"]
          audio_duration_seconds?: number | null
          audio_duration_source?:
            | Database["public"]["Enums"]["duration_source"]
            | null
          audio_file_name?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          book_id: string
          created_at?: string
          id?: string
          number: number
          script_file_name?: string | null
          script_path?: string | null
          script_text?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          access?: Database["public"]["Enums"]["chapter_access"]
          audio_duration_seconds?: number | null
          audio_duration_source?:
            | Database["public"]["Enums"]["duration_source"]
            | null
          audio_file_name?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          book_id?: string
          created_at?: string
          id?: string
          number?: number
          script_file_name?: string | null
          script_path?: string | null
          script_text?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "chapters_needing_attention"
            referencedColumns: ["book_id"]
          },
        ]
      }
    }
    Views: {
      books_catalog: {
        Row: {
          audio_count: number | null
          author: string | null
          chapter_count: number | null
          cover_height: number | null
          cover_path: string | null
          cover_width: number | null
          created_at: string | null
          default_chapter_access:
            | Database["public"]["Enums"]["chapter_access"]
            | null
          free_chapter_count: number | null
          genres: string[] | null
          id: string | null
          maturity: Database["public"]["Enums"]["maturity"] | null
          short_description: string | null
          synopsis: string | null
          title: string | null
          total_duration_seconds: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      chapters_catalog: {
        Row: {
          access: Database["public"]["Enums"]["chapter_access"] | null
          audio_duration_seconds: number | null
          audio_duration_source:
            | Database["public"]["Enums"]["duration_source"]
            | null
          book_id: string | null
          created_at: string | null
          has_audio: boolean | null
          has_text: boolean | null
          id: string | null
          number: number | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "chapters_needing_attention"
            referencedColumns: ["book_id"]
          },
        ]
      }
      chapters_list: {
        Row: {
          access: Database["public"]["Enums"]["chapter_access"] | null
          audio_duration_seconds: number | null
          audio_duration_source:
            | Database["public"]["Enums"]["duration_source"]
            | null
          audio_file_name: string | null
          audio_path: string | null
          audio_size_bytes: number | null
          book_id: string | null
          created_at: string | null
          has_script: boolean | null
          id: string | null
          number: number | null
          script_file_name: string | null
          script_path: string | null
          script_word_count: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          access?: Database["public"]["Enums"]["chapter_access"] | null
          audio_duration_seconds?: number | null
          audio_duration_source?:
            | Database["public"]["Enums"]["duration_source"]
            | null
          audio_file_name?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          book_id?: string | null
          created_at?: string | null
          has_script?: never
          id?: string | null
          number?: number | null
          script_file_name?: string | null
          script_path?: string | null
          script_word_count?: never
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          access?: Database["public"]["Enums"]["chapter_access"] | null
          audio_duration_seconds?: number | null
          audio_duration_source?:
            | Database["public"]["Enums"]["duration_source"]
            | null
          audio_file_name?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          book_id?: string | null
          created_at?: string | null
          has_script?: never
          id?: string | null
          number?: number | null
          script_file_name?: string | null
          script_path?: string | null
          script_word_count?: never
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "chapters_needing_attention"
            referencedColumns: ["book_id"]
          },
        ]
      }
      chapters_needing_attention: {
        Row: {
          book_id: string | null
          book_title: string | null
          chapter_id: string | null
          chapter_number: number | null
          chapter_title: string | null
          missing: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      clerk_user_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      book_status: "draft" | "published"
      chapter_access: "free" | "locked"
      duration_source: "detected" | "manual"
      maturity: "general" | "mature_17"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      book_status: ["draft", "published"],
      chapter_access: ["free", "locked"],
      duration_source: ["detected", "manual"],
      maturity: ["general", "mature_17"],
    },
  },
} as const
