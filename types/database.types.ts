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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          key: string
          league_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          league_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          league_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          league_id: string | null
          metadata_json: Json | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          league_id?: string | null
          metadata_json?: Json | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          league_id?: string | null
          metadata_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_runs: {
        Row: {
          config_json: Json
          engine_version: string
          id: string
          matchday_id: string
          note: string | null
          published_at: string | null
          published_by: string | null
          run_number: number
          status: Database["public"]["Enums"]["calculation_status"]
          triggered_at: string
          triggered_by: string
        }
        Insert: {
          config_json?: Json
          engine_version?: string
          id?: string
          matchday_id: string
          note?: string | null
          published_at?: string | null
          published_by?: string | null
          run_number: number
          status?: Database["public"]["Enums"]["calculation_status"]
          triggered_at?: string
          triggered_by: string
        }
        Update: {
          config_json?: Json
          engine_version?: string
          id?: string
          matchday_id?: string
          note?: string | null
          published_at?: string | null
          published_by?: string | null
          run_number?: number
          status?: Database["public"]["Enums"]["calculation_status"]
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_runs_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_runs_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_fixtures: {
        Row: {
          away_fantavoto: number | null
          away_points: number | null
          away_score: number | null
          away_team_id: string
          competition_id: string
          computed_at: string | null
          home_fantavoto: number | null
          home_points: number | null
          home_score: number | null
          home_team_id: string
          id: string
          result: Database["public"]["Enums"]["fixture_result"] | null
          round_id: string
        }
        Insert: {
          away_fantavoto?: number | null
          away_points?: number | null
          away_score?: number | null
          away_team_id: string
          competition_id: string
          computed_at?: string | null
          home_fantavoto?: number | null
          home_points?: number | null
          home_score?: number | null
          home_team_id: string
          id?: string
          result?: Database["public"]["Enums"]["fixture_result"] | null
          round_id: string
        }
        Update: {
          away_fantavoto?: number | null
          away_points?: number | null
          away_score?: number | null
          away_team_id?: string
          competition_id?: string
          computed_at?: string | null
          home_fantavoto?: number | null
          home_points?: number | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          result?: Database["public"]["Enums"]["fixture_result"] | null
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_fixtures_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_fixtures_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "competition_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_matchups: {
        Row: {
          away_fantavoto: number | null
          away_team_id: string
          competition_id: string
          computed_at: string | null
          created_at: string
          home_fantavoto: number | null
          home_team_id: string
          id: string
          result: string | null
          round_number: number
        }
        Insert: {
          away_fantavoto?: number | null
          away_team_id: string
          competition_id: string
          computed_at?: string | null
          created_at?: string
          home_fantavoto?: number | null
          home_team_id: string
          id?: string
          result?: string | null
          round_number: number
        }
        Update: {
          away_fantavoto?: number | null
          away_team_id?: string
          competition_id?: string
          computed_at?: string | null
          created_at?: string
          home_fantavoto?: number | null
          home_team_id?: string
          id?: string
          result?: string | null
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "competition_matchups_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_matchups_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_matchups_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_rounds: {
        Row: {
          competition_id: string
          computed_at: string | null
          id: string
          matchday_id: string | null
          name: string
          phase: string
          round_number: number
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          competition_id: string
          computed_at?: string | null
          id?: string
          matchday_id?: string | null
          name: string
          phase?: string
          round_number: number
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          competition_id?: string
          computed_at?: string | null
          id?: string
          matchday_id?: string | null
          name?: string
          phase?: string
          round_number?: number
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "competition_rounds_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_rounds_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_standings_snapshots: {
        Row: {
          after_round_id: string
          competition_id: string
          created_at: string
          id: string
          league_id: string
          snapshot_json: Json
          version_number: number
        }
        Insert: {
          after_round_id: string
          competition_id: string
          created_at?: string
          id?: string
          league_id: string
          snapshot_json: Json
          version_number: number
        }
        Update: {
          after_round_id?: string
          competition_id?: string
          created_at?: string
          id?: string
          league_id?: string
          snapshot_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "competition_standings_snapshots_after_round_id_fkey"
            columns: ["after_round_id"]
            isOneToOne: false
            referencedRelation: "competition_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_standings_snapshots_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_standings_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_teams: {
        Row: {
          competition_id: string
          group_label: string | null
          id: string
          seed: number | null
          team_id: string
        }
        Insert: {
          competition_id: string
          group_label?: string | null
          id?: string
          seed?: number | null
          team_id: string
        }
        Update: {
          competition_id?: string
          group_label?: string | null
          id?: string
          seed?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          coppa_config: Json | null
          created_at: string
          created_by: string | null
          id: string
          league_id: string
          name: string
          scoring_config: Json
          season: string | null
          slug: string | null
          status: Database["public"]["Enums"]["competition_status"]
          tiebreaker_config: Json
          type: Database["public"]["Enums"]["competition_type"]
        }
        Insert: {
          coppa_config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          league_id: string
          name: string
          scoring_config?: Json
          season?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["competition_status"]
          tiebreaker_config?: Json
          type: Database["public"]["Enums"]["competition_type"]
        }
        Update: {
          coppa_config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          league_id?: string
          name?: string
          scoring_config?: Json
          season?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["competition_status"]
          tiebreaker_config?: Json
          type?: Database["public"]["Enums"]["competition_type"]
        }
        Relationships: [
          {
            foreignKeyName: "competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          duration_ms: number | null
          endpoint: string
          error: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          started_at: string
          status: string
          summary: Json | null
        }
        Insert: {
          duration_ms?: number | null
          endpoint: string
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          started_at?: string
          status: string
          summary?: Json | null
        }
        Update: {
          duration_ms?: number | null
          endpoint?: string
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Relationships: []
      }
      fantasy_team_transfer_request: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          league_id: string
          message: string | null
          responded_at: string | null
          status: string
          team_id: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          league_id: string
          message?: string | null
          responded_at?: string | null
          status?: string
          team_id: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          league_id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          team_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_team_transfer_request_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_team_transfer_request_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_teams: {
        Row: {
          created_at: string
          id: string
          league_id: string
          leghe_names: string[]
          manager_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          leghe_names?: string[]
          manager_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          leghe_names?: string[]
          manager_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["fm_audit_action"]
          actor_id: string | null
          competition_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          action: Database["public"]["Enums"]["fm_audit_action"]
          actor_id?: string | null
          competition_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: Database["public"]["Enums"]["fm_audit_action"]
          actor_id?: string | null
          competition_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fm_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_audit_log_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_battle_royale_matchup: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          result: Database["public"]["Enums"]["fm_match_result"]
          scoring_round_id: string
          team_a_goals: number
          team_a_id: string
          team_a_points: number
          team_a_score: number
          team_b_goals: number
          team_b_id: string
          team_b_points: number
          team_b_score: number
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          result: Database["public"]["Enums"]["fm_match_result"]
          scoring_round_id: string
          team_a_goals: number
          team_a_id: string
          team_a_points: number
          team_a_score: number
          team_b_goals: number
          team_b_id: string
          team_b_points: number
          team_b_score: number
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          result?: Database["public"]["Enums"]["fm_match_result"]
          scoring_round_id?: string
          team_a_goals?: number
          team_a_id?: string
          team_a_points?: number
          team_a_score?: number
          team_b_goals?: number
          team_b_id?: string
          team_b_points?: number
          team_b_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "fm_battle_royale_matchup_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_battle_royale_matchup_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_battle_royale_matchup_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "fm_fantasy_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_battle_royale_matchup_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "fm_fantasy_team"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_coach: {
        Row: {
          competition_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          national_team_id: string
          sportmonks_coach_id: number | null
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          national_team_id: string
          sportmonks_coach_id?: number | null
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          national_team_id?: string
          sportmonks_coach_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_coach_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_coach_national_team_id_fkey"
            columns: ["national_team_id"]
            isOneToOne: false
            referencedRelation: "fm_national_team"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_coach_match_score: {
        Row: {
          bonus_or_malus: number
          calc_snapshot: Json | null
          coach_id: string
          created_at: string
          final_score: number
          id: string
          match_result: Database["public"]["Enums"]["fm_match_result"]
          real_match_id: string
          scoring_round_id: string
          team_tier: Database["public"]["Enums"]["fm_team_tier"]
          updated_at: string
        }
        Insert: {
          bonus_or_malus: number
          calc_snapshot?: Json | null
          coach_id: string
          created_at?: string
          final_score: number
          id?: string
          match_result: Database["public"]["Enums"]["fm_match_result"]
          real_match_id: string
          scoring_round_id: string
          team_tier: Database["public"]["Enums"]["fm_team_tier"]
          updated_at?: string
        }
        Update: {
          bonus_or_malus?: number
          calc_snapshot?: Json | null
          coach_id?: string
          created_at?: string
          final_score?: number
          id?: string
          match_result?: Database["public"]["Enums"]["fm_match_result"]
          real_match_id?: string
          scoring_round_id?: string
          team_tier?: Database["public"]["Enums"]["fm_team_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_coach_match_score_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "fm_coach"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_coach_match_score_real_match_id_fkey"
            columns: ["real_match_id"]
            isOneToOne: false
            referencedRelation: "fm_real_match"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_coach_match_score_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_competition: {
        Row: {
          active_sportmonks_league_id: number | null
          created_at: string
          edition: string
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["fm_competition_kind"]
          name: string
          starts_at: string | null
          status: Database["public"]["Enums"]["fm_competition_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          active_sportmonks_league_id?: number | null
          created_at?: string
          edition: string
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fm_competition_kind"]
          name: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["fm_competition_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          active_sportmonks_league_id?: number | null
          created_at?: string
          edition?: string
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fm_competition_kind"]
          name?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["fm_competition_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      fm_competition_coach_tier: {
        Row: {
          coach_id: string
          competition_id: string
          created_at: string
          id: string
          tier: Database["public"]["Enums"]["fm_team_tier"]
          updated_at: string
        }
        Insert: {
          coach_id: string
          competition_id: string
          created_at?: string
          id?: string
          tier: Database["public"]["Enums"]["fm_team_tier"]
          updated_at?: string
        }
        Update: {
          coach_id?: string
          competition_id?: string
          created_at?: string
          id?: string
          tier?: Database["public"]["Enums"]["fm_team_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_competition_coach_tier_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "fm_coach"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_competition_coach_tier_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_competition_config: {
        Row: {
          competition_id: string
          config: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          competition_id: string
          config?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          competition_id?: string
          config?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fm_competition_config_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: true
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_competition_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_competition_standing: {
        Row: {
          best_round_score: number
          br_points_total: number
          computed_at: string
          fantasy_team_id: string
          id: string
          league_competition_id: string
          mvp_bonus_total: number
          popularity_penalty_total: number
          rank: number | null
          raw_score_total: number
          round_wins: number
        }
        Insert: {
          best_round_score?: number
          br_points_total?: number
          computed_at?: string
          fantasy_team_id: string
          id?: string
          league_competition_id: string
          mvp_bonus_total?: number
          popularity_penalty_total?: number
          rank?: number | null
          raw_score_total?: number
          round_wins?: number
        }
        Update: {
          best_round_score?: number
          br_points_total?: number
          computed_at?: string
          fantasy_team_id?: string
          id?: string
          league_competition_id?: string
          mvp_bonus_total?: number
          popularity_penalty_total?: number
          rank?: number | null
          raw_score_total?: number
          round_wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "fm_competition_standing_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fm_fantasy_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_competition_standing_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_fantasy_team: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          manager_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          manager_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          manager_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_fantasy_team_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_fantasy_team_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_fantasy_team_round_score: {
        Row: {
          br_draws: number
          br_losses: number
          br_points: number
          br_wins: number
          coach_total: number
          created_at: string
          fantasy_team_id: string
          goals_scored: number
          id: string
          player_total: number
          rank_in_round: number | null
          raw_total: number
          scoring_round_id: string
          updated_at: string
        }
        Insert: {
          br_draws?: number
          br_losses?: number
          br_points?: number
          br_wins?: number
          coach_total?: number
          created_at?: string
          fantasy_team_id: string
          goals_scored?: number
          id?: string
          player_total?: number
          rank_in_round?: number | null
          raw_total?: number
          scoring_round_id: string
          updated_at?: string
        }
        Update: {
          br_draws?: number
          br_losses?: number
          br_points?: number
          br_wins?: number
          coach_total?: number
          created_at?: string
          fantasy_team_id?: string
          goals_scored?: number
          id?: string
          player_total?: number
          rank_in_round?: number | null
          raw_total?: number
          scoring_round_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_fantasy_team_round_score_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fm_fantasy_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_fantasy_team_round_score_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_fantasy_team_transfer_request: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          league_competition_id: string
          league_id: string
          message: string | null
          responded_at: string | null
          status: string
          team_id: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          league_competition_id: string
          league_id: string
          message?: string | null
          responded_at?: string | null
          status?: string
          team_id: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          league_competition_id?: string
          league_id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          team_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_fantasy_team_transfer_request_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_fantasy_team_transfer_request_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_fantasy_team_transfer_request_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fm_fantasy_team"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_league_competition: {
        Row: {
          created_at: string
          created_by: string | null
          fm_competition_id: string
          id: string
          league_id: string
          slug: string | null
          status: Database["public"]["Enums"]["fm_league_competition_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fm_competition_id: string
          id?: string
          league_id: string
          slug?: string | null
          status?: Database["public"]["Enums"]["fm_league_competition_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fm_competition_id?: string
          id?: string
          league_id?: string
          slug?: string | null
          status?: Database["public"]["Enums"]["fm_league_competition_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fm_league_competition_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_league_competition_fm_competition_id_fkey"
            columns: ["fm_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_league_competition_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_league_competition_config: {
        Row: {
          config: Json
          league_competition_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          league_competition_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          league_competition_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fm_league_competition_config_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: true
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_league_competition_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_league_phase: {
        Row: {
          budget_config: Json
          budget_mode: Database["public"]["Enums"]["fm_budget_mode"]
          created_at: string
          id: string
          league_competition_id: string
          phase_id: string
          requires_new_squad: boolean
          updated_at: string
        }
        Insert: {
          budget_config?: Json
          budget_mode?: Database["public"]["Enums"]["fm_budget_mode"]
          created_at?: string
          id?: string
          league_competition_id: string
          phase_id: string
          requires_new_squad?: boolean
          updated_at?: string
        }
        Update: {
          budget_config?: Json
          budget_mode?: Database["public"]["Enums"]["fm_budget_mode"]
          created_at?: string
          id?: string
          league_competition_id?: string
          phase_id?: string
          requires_new_squad?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_league_phase_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_league_phase_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "fm_phase"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_league_phase_player_price: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          phase_id: string
          player_id: string
          price: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          phase_id: string
          player_id: string
          price: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          phase_id?: string
          player_id?: string
          price?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_league_phase_player_price_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_league_phase_player_price_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "fm_phase"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_league_phase_player_price_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fm_player"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_live_round_snapshot: {
        Row: {
          computed_at: string
          league_competition_id: string
          scoring_round_id: string
          snapshot: Json
        }
        Insert: {
          computed_at?: string
          league_competition_id: string
          scoring_round_id: string
          snapshot: Json
        }
        Update: {
          computed_at?: string
          league_competition_id?: string
          scoring_round_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fm_live_round_snapshot_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_live_round_snapshot_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_matchday_lineup: {
        Row: {
          created_at: string
          fantasy_team_id: string
          formation: string
          id: string
          locked_at: string | null
          phase_squad_id: string
          scoring_round_id: string
          status: Database["public"]["Enums"]["fm_lineup_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fantasy_team_id: string
          formation: string
          id?: string
          locked_at?: string | null
          phase_squad_id: string
          scoring_round_id: string
          status?: Database["public"]["Enums"]["fm_lineup_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fantasy_team_id?: string
          formation?: string
          id?: string
          locked_at?: string | null
          phase_squad_id?: string
          scoring_round_id?: string
          status?: Database["public"]["Enums"]["fm_lineup_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_matchday_lineup_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fm_fantasy_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_matchday_lineup_phase_squad_id_fkey"
            columns: ["phase_squad_id"]
            isOneToOne: false
            referencedRelation: "fm_phase_squad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_matchday_lineup_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_matchday_lineup_player: {
        Row: {
          bench_order: number | null
          created_at: string
          id: string
          is_starter: boolean
          lineup_id: string
          player_id: string
          slot_order: number
          slot_position: string
        }
        Insert: {
          bench_order?: number | null
          created_at?: string
          id?: string
          is_starter?: boolean
          lineup_id: string
          player_id: string
          slot_order: number
          slot_position: string
        }
        Update: {
          bench_order?: number | null
          created_at?: string
          id?: string
          is_starter?: boolean
          lineup_id?: string
          player_id?: string
          slot_order?: number
          slot_position?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_matchday_lineup_player_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "fm_matchday_lineup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_matchday_lineup_player_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fm_player"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_national_team: {
        Row: {
          competition_id: string
          created_at: string
          eliminated_at: string | null
          fifa_code: string
          flag_emoji: string | null
          flag_url: string | null
          group_label: string | null
          id: string
          logo_url: string | null
          name: string
          sportmonks_team_id: number | null
          status: Database["public"]["Enums"]["fm_team_status"]
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          eliminated_at?: string | null
          fifa_code: string
          flag_emoji?: string | null
          flag_url?: string | null
          group_label?: string | null
          id?: string
          logo_url?: string | null
          name: string
          sportmonks_team_id?: number | null
          status?: Database["public"]["Enums"]["fm_team_status"]
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          eliminated_at?: string | null
          fifa_code?: string
          flag_emoji?: string | null
          flag_url?: string | null
          group_label?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          sportmonks_team_id?: number | null
          status?: Database["public"]["Enums"]["fm_team_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_national_team_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_phase: {
        Row: {
          budget_config: Json
          budget_mode: Database["public"]["Enums"]["fm_budget_mode"]
          competition_id: string
          created_at: string
          display_order: number
          id: string
          kind: Database["public"]["Enums"]["fm_phase_kind"]
          name: string
          requires_new_squad: boolean
          reveal_at: string | null
          sportmonks_stage_id: number | null
          squad_lock_at: string | null
          squad_open_at: string | null
          status: Database["public"]["Enums"]["fm_phase_status"]
          updated_at: string
        }
        Insert: {
          budget_config?: Json
          budget_mode?: Database["public"]["Enums"]["fm_budget_mode"]
          competition_id: string
          created_at?: string
          display_order: number
          id?: string
          kind: Database["public"]["Enums"]["fm_phase_kind"]
          name: string
          requires_new_squad?: boolean
          reveal_at?: string | null
          sportmonks_stage_id?: number | null
          squad_lock_at?: string | null
          squad_open_at?: string | null
          status?: Database["public"]["Enums"]["fm_phase_status"]
          updated_at?: string
        }
        Update: {
          budget_config?: Json
          budget_mode?: Database["public"]["Enums"]["fm_budget_mode"]
          competition_id?: string
          created_at?: string
          display_order?: number
          id?: string
          kind?: Database["public"]["Enums"]["fm_phase_kind"]
          name?: string
          requires_new_squad?: boolean
          reveal_at?: string | null
          sportmonks_stage_id?: number | null
          squad_lock_at?: string | null
          squad_open_at?: string | null
          status?: Database["public"]["Enums"]["fm_phase_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_phase_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_phase_coach_tier: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          odds_source: string | null
          odds_value: number | null
          phase_id: string
          tier: Database["public"]["Enums"]["fm_team_tier"]
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          odds_source?: string | null
          odds_value?: number | null
          phase_id: string
          tier: Database["public"]["Enums"]["fm_team_tier"]
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          odds_source?: string | null
          odds_value?: number | null
          phase_id?: string
          tier?: Database["public"]["Enums"]["fm_team_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_phase_coach_tier_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "fm_coach"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_phase_coach_tier_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "fm_phase"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_phase_player_price: {
        Row: {
          created_at: string
          id: string
          phase_id: string
          player_id: string
          price: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          phase_id: string
          player_id: string
          price: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          phase_id?: string
          player_id?: string
          price?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_phase_player_price_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "fm_phase"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_phase_player_price_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fm_player"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_phase_squad: {
        Row: {
          budget_spent: number
          budget_total: number
          coach_id: string | null
          created_at: string
          fantasy_team_id: string
          id: string
          locked_at: string | null
          phase_id: string
          status: Database["public"]["Enums"]["fm_squad_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          budget_spent?: number
          budget_total: number
          coach_id?: string | null
          created_at?: string
          fantasy_team_id: string
          id?: string
          locked_at?: string | null
          phase_id: string
          status?: Database["public"]["Enums"]["fm_squad_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          budget_spent?: number
          budget_total?: number
          coach_id?: string | null
          created_at?: string
          fantasy_team_id?: string
          id?: string
          locked_at?: string | null
          phase_id?: string
          status?: Database["public"]["Enums"]["fm_squad_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_phase_squad_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "fm_coach"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_phase_squad_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fm_fantasy_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_phase_squad_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "fm_phase"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_phase_squad_player: {
        Row: {
          created_at: string
          id: string
          phase_squad_id: string
          player_id: string
          purchase_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          phase_squad_id: string
          player_id: string
          purchase_price: number
        }
        Update: {
          created_at?: string
          id?: string
          phase_squad_id?: string
          player_id?: string
          purchase_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fm_phase_squad_player_phase_squad_id_fkey"
            columns: ["phase_squad_id"]
            isOneToOne: false
            referencedRelation: "fm_phase_squad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_phase_squad_player_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fm_player"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_player: {
        Row: {
          base_price: number
          competition_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          national_team_id: string
          photo_url: string | null
          role: Database["public"]["Enums"]["fm_player_role"]
          shirt_number: number | null
          sportmonks_player_id: number | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          competition_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          national_team_id: string
          photo_url?: string | null
          role: Database["public"]["Enums"]["fm_player_role"]
          shirt_number?: number | null
          sportmonks_player_id?: number | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          competition_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          national_team_id?: string
          photo_url?: string | null
          role?: Database["public"]["Enums"]["fm_player_role"]
          shirt_number?: number | null
          sportmonks_player_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_player_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_player_national_team_id_fkey"
            columns: ["national_team_id"]
            isOneToOne: false
            referencedRelation: "fm_national_team"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_player_match_score: {
        Row: {
          base_rating: number | null
          calc_snapshot: Json | null
          created_at: string
          football_bonus: number
          football_malus: number
          id: string
          is_mvp: boolean
          player_id: string
          raw_subtotal: number
          real_match_id: string
          scoring_round_id: string
          updated_at: string
          voto_base: number | null
          z_rating: number | null
        }
        Insert: {
          base_rating?: number | null
          calc_snapshot?: Json | null
          created_at?: string
          football_bonus?: number
          football_malus?: number
          id?: string
          is_mvp?: boolean
          player_id: string
          raw_subtotal?: number
          real_match_id: string
          scoring_round_id: string
          updated_at?: string
          voto_base?: number | null
          z_rating?: number | null
        }
        Update: {
          base_rating?: number | null
          calc_snapshot?: Json | null
          created_at?: string
          football_bonus?: number
          football_malus?: number
          id?: string
          is_mvp?: boolean
          player_id?: string
          raw_subtotal?: number
          real_match_id?: string
          scoring_round_id?: string
          updated_at?: string
          voto_base?: number | null
          z_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fm_player_match_score_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fm_player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_player_match_score_real_match_id_fkey"
            columns: ["real_match_id"]
            isOneToOne: false
            referencedRelation: "fm_real_match"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_player_match_score_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_player_match_stats: {
        Row: {
          assists: number
          clean_sheet: boolean
          created_at: string
          goals: number
          goals_conceded: number
          id: string
          is_mvp: boolean
          minutes_played: number
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          penalties_scored: number
          player_id: string
          rating: number | null
          raw_payload: Json | null
          real_match_id: string
          red_cards: number
          updated_at: string
          yellow_cards: number
        }
        Insert: {
          assists?: number
          clean_sheet?: boolean
          created_at?: string
          goals?: number
          goals_conceded?: number
          id?: string
          is_mvp?: boolean
          minutes_played?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id: string
          rating?: number | null
          raw_payload?: Json | null
          real_match_id: string
          red_cards?: number
          updated_at?: string
          yellow_cards?: number
        }
        Update: {
          assists?: number
          clean_sheet?: boolean
          created_at?: string
          goals?: number
          goals_conceded?: number
          id?: string
          is_mvp?: boolean
          minutes_played?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id?: string
          rating?: number | null
          raw_payload?: Json | null
          real_match_id?: string
          red_cards?: number
          updated_at?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "fm_player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fm_player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_player_match_stats_real_match_id_fkey"
            columns: ["real_match_id"]
            isOneToOne: false
            referencedRelation: "fm_real_match"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_real_match: {
        Row: {
          away_score: number | null
          away_team_id: string
          created_at: string
          fotmob_match_id: number | null
          fotmob_url: string | null
          home_score: number | null
          home_team_id: string
          id: string
          kickoff_at: string
          result: Database["public"]["Enums"]["fm_match_result"] | null
          scoring_round_id: string
          sportmonks_fixture_id: number | null
          status: Database["public"]["Enums"]["fm_match_status"]
          updated_at: string
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          created_at?: string
          fotmob_match_id?: number | null
          fotmob_url?: string | null
          home_score?: number | null
          home_team_id: string
          id?: string
          kickoff_at: string
          result?: Database["public"]["Enums"]["fm_match_result"] | null
          scoring_round_id: string
          sportmonks_fixture_id?: number | null
          status?: Database["public"]["Enums"]["fm_match_status"]
          updated_at?: string
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          created_at?: string
          fotmob_match_id?: number | null
          fotmob_url?: string | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          kickoff_at?: string
          result?: Database["public"]["Enums"]["fm_match_result"] | null
          scoring_round_id?: string
          sportmonks_fixture_id?: number | null
          status?: Database["public"]["Enums"]["fm_match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_real_match_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "fm_national_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_real_match_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "fm_national_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_real_match_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_round_player_ownership: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          ownership_pct: number
          player_id: string
          scoring_round_id: string
          teams_owning: number
          teams_total: number
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          ownership_pct: number
          player_id: string
          scoring_round_id: string
          teams_owning: number
          teams_total: number
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          ownership_pct?: number
          player_id?: string
          scoring_round_id?: string
          teams_owning?: number
          teams_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fm_round_player_ownership_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "fm_league_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_round_player_ownership_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fm_player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_round_player_ownership_scoring_round_id_fkey"
            columns: ["scoring_round_id"]
            isOneToOne: false
            referencedRelation: "fm_scoring_round"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_scoring_round: {
        Row: {
          competition_id: string
          created_at: string
          display_order: number
          id: string
          lineup_open_at: string | null
          lock_at: string | null
          name: string
          phase_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["fm_round_status"]
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          display_order: number
          id?: string
          lineup_open_at?: string | null
          lock_at?: string | null
          name: string
          phase_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["fm_round_status"]
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          display_order?: number
          id?: string
          lineup_open_at?: string | null
          lock_at?: string | null
          name?: string
          phase_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["fm_round_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_scoring_round_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "fm_competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_scoring_round_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "fm_phase"
            referencedColumns: ["id"]
          },
        ]
      }
      formation_slots: {
        Row: {
          allowed_mantra_roles: string[]
          bench_order: number | null
          extended_mantra_roles: string[]
          formation_id: string
          id: string
          is_bench: boolean
          slot_name: string
          slot_order: number
        }
        Insert: {
          allowed_mantra_roles: string[]
          bench_order?: number | null
          extended_mantra_roles?: string[]
          formation_id: string
          id?: string
          is_bench?: boolean
          slot_name: string
          slot_order: number
        }
        Update: {
          allowed_mantra_roles?: string[]
          bench_order?: number | null
          extended_mantra_roles?: string[]
          formation_id?: string
          id?: string
          is_bench?: boolean
          slot_name?: string
          slot_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "formation_slots_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "formations"
            referencedColumns: ["id"]
          },
        ]
      }
      formations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          league_id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          league_id: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          league_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "formations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_engine_config: {
        Row: {
          assist: number
          brace_bonus: number
          calc_order: string
          clean_sheet_def: number
          clean_sheet_gk: number
          clean_sheet_min_minutes: number
          created_at: string
          goal_bonus_att: number
          goal_bonus_def: number
          goal_bonus_gk: number
          goal_bonus_mid: number
          goal_thresholds: Json
          goals_conceded_def: number
          goals_conceded_def_min_minutes: number
          goals_conceded_gk: number
          hat_trick_bonus: number
          id: string
          league_id: string
          mvp_bonus_brackets: Json
          own_goal: number
          penalty_missed: number
          penalty_saved: number
          penalty_scored_discount: number
          pivot_rating: number
          pivot_vote: number
          popularity_brackets: Json
          red_card: number
          result_points: Json
          smoothing: Json
          updated_at: string
          yellow_card: number
        }
        Insert: {
          assist?: number
          brace_bonus?: number
          calc_order?: string
          clean_sheet_def?: number
          clean_sheet_gk?: number
          clean_sheet_min_minutes?: number
          created_at?: string
          goal_bonus_att?: number
          goal_bonus_def?: number
          goal_bonus_gk?: number
          goal_bonus_mid?: number
          goal_thresholds?: Json
          goals_conceded_def?: number
          goals_conceded_def_min_minutes?: number
          goals_conceded_gk?: number
          hat_trick_bonus?: number
          id?: string
          league_id: string
          mvp_bonus_brackets?: Json
          own_goal?: number
          penalty_missed?: number
          penalty_saved?: number
          penalty_scored_discount?: number
          pivot_rating?: number
          pivot_vote?: number
          popularity_brackets?: Json
          red_card?: number
          result_points?: Json
          smoothing?: Json
          updated_at?: string
          yellow_card?: number
        }
        Update: {
          assist?: number
          brace_bonus?: number
          calc_order?: string
          clean_sheet_def?: number
          clean_sheet_gk?: number
          clean_sheet_min_minutes?: number
          created_at?: string
          goal_bonus_att?: number
          goal_bonus_def?: number
          goal_bonus_gk?: number
          goal_bonus_mid?: number
          goal_thresholds?: Json
          goals_conceded_def?: number
          goals_conceded_def_min_minutes?: number
          goals_conceded_gk?: number
          hat_trick_bonus?: number
          id?: string
          league_id?: string
          mvp_bonus_brackets?: Json
          own_goal?: number
          penalty_missed?: number
          penalty_saved?: number
          penalty_scored_discount?: number
          pivot_rating?: number
          pivot_vote?: number
          popularity_brackets?: Json
          red_card?: number
          result_points?: Json
          smoothing?: Json
          updated_at?: string
          yellow_card?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_engine_config_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_players: {
        Row: {
          club: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          league_id: string
          mantra_roles: string[]
          notes: string | null
          primary_mantra_role: string | null
          rating_class: Database["public"]["Enums"]["rating_class"]
          serie_a_player_id: string | null
          updated_at: string
        }
        Insert: {
          club: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          league_id: string
          mantra_roles: string[]
          notes?: string | null
          primary_mantra_role?: string | null
          rating_class: Database["public"]["Enums"]["rating_class"]
          serie_a_player_id?: string | null
          updated_at?: string
        }
        Update: {
          club?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          league_id?: string
          mantra_roles?: string[]
          notes?: string | null
          primary_mantra_role?: string | null
          rating_class?: Database["public"]["Enums"]["rating_class"]
          serie_a_player_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_players_serie_a_player_id_fkey"
            columns: ["serie_a_player_id"]
            isOneToOne: false
            referencedRelation: "serie_a_players"
            referencedColumns: ["id"]
          },
        ]
      }
      league_users: {
        Row: {
          id: string
          joined_at: string
          league_id: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          league_id: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          league_id?: string
          role?: Database["public"]["Enums"]["league_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_users_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          active_sportmonks_league_id: number | null
          advanced_bonuses_enabled: boolean
          bench_size: number
          created_at: string
          display_rounding: Database["public"]["Enums"]["display_rounding"]
          id: string
          invite_token: string | null
          lock_behavior: Database["public"]["Enums"]["lock_behavior"]
          name: string
          scoring_mode: Database["public"]["Enums"]["scoring_mode"]
          season_name: string
          timezone: string
          updated_at: string
          weekly_budget: number
        }
        Insert: {
          active_sportmonks_league_id?: number | null
          advanced_bonuses_enabled?: boolean
          bench_size?: number
          created_at?: string
          display_rounding?: Database["public"]["Enums"]["display_rounding"]
          id?: string
          invite_token?: string | null
          lock_behavior?: Database["public"]["Enums"]["lock_behavior"]
          name: string
          scoring_mode?: Database["public"]["Enums"]["scoring_mode"]
          season_name: string
          timezone?: string
          updated_at?: string
          weekly_budget?: number
        }
        Update: {
          active_sportmonks_league_id?: number | null
          advanced_bonuses_enabled?: boolean
          bench_size?: number
          created_at?: string
          display_rounding?: Database["public"]["Enums"]["display_rounding"]
          id?: string
          invite_token?: string | null
          lock_behavior?: Database["public"]["Enums"]["lock_behavior"]
          name?: string
          scoring_mode?: Database["public"]["Enums"]["scoring_mode"]
          season_name?: string
          timezone?: string
          updated_at?: string
          weekly_budget?: number
        }
        Relationships: []
      }
      lineup_current_pointers: {
        Row: {
          id: string
          matchday_id: string
          submission_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          matchday_id: string
          submission_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          matchday_id?: string
          submission_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_current_pointers_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_current_pointers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "lineup_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_current_pointers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_submission_players: {
        Row: {
          assigned_mantra_role: string | null
          bench_order: number | null
          id: string
          is_bench: boolean
          player_id: string
          slot_id: string
          submission_id: string
        }
        Insert: {
          assigned_mantra_role?: string | null
          bench_order?: number | null
          id?: string
          is_bench?: boolean
          player_id: string
          slot_id: string
          submission_id: string
        }
        Update: {
          assigned_mantra_role?: string | null
          bench_order?: number | null
          id?: string
          is_bench?: boolean
          player_id?: string
          slot_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_submission_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submission_players_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "formation_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submission_players_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "lineup_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_submissions: {
        Row: {
          actor_user_id: string
          created_at: string
          formation_id: string
          id: string
          matchday_id: string
          source_ip: string | null
          status: Database["public"]["Enums"]["lineup_status"]
          submission_number: number
          submitted_at: string | null
          team_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          formation_id: string
          id?: string
          matchday_id: string
          source_ip?: string | null
          status?: Database["public"]["Enums"]["lineup_status"]
          submission_number?: number
          submitted_at?: string | null
          team_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          formation_id?: string
          id?: string
          matchday_id?: string
          source_ip?: string | null
          status?: Database["public"]["Enums"]["lineup_status"]
          submission_number?: number
          submitted_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_submissions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submissions_formation_id_fkey"
            columns: ["formation_id"]
            isOneToOne: false
            referencedRelation: "formations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submissions_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_player_scores: {
        Row: {
          assigned_mantra_role: string | null
          assists: number
          bench_order: number | null
          bonus_malus_breakdown: Json | null
          extended_penalty: number
          fantavoto: number | null
          goals_conceded: number
          goals_scored: number
          is_bench: boolean
          is_match_live: boolean
          matchday_id: string
          minutes_factor: number | null
          minutes_played: number
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          penalties_scored: number
          player_id: string
          rating: number | null
          red_cards: number
          refreshed_at: string
          role_multiplier: number | null
          saves: number
          sub_status: string
          team_id: string
          voto_base: number | null
          yellow_cards: number
          z_rating: number | null
        }
        Insert: {
          assigned_mantra_role?: string | null
          assists?: number
          bench_order?: number | null
          bonus_malus_breakdown?: Json | null
          extended_penalty?: number
          fantavoto?: number | null
          goals_conceded?: number
          goals_scored?: number
          is_bench?: boolean
          is_match_live?: boolean
          matchday_id: string
          minutes_factor?: number | null
          minutes_played?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id: string
          rating?: number | null
          red_cards?: number
          refreshed_at?: string
          role_multiplier?: number | null
          saves?: number
          sub_status?: string
          team_id: string
          voto_base?: number | null
          yellow_cards?: number
          z_rating?: number | null
        }
        Update: {
          assigned_mantra_role?: string | null
          assists?: number
          bench_order?: number | null
          bonus_malus_breakdown?: Json | null
          extended_penalty?: number
          fantavoto?: number | null
          goals_conceded?: number
          goals_scored?: number
          is_bench?: boolean
          is_match_live?: boolean
          matchday_id?: string
          minutes_factor?: number | null
          minutes_played?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id?: string
          rating?: number | null
          red_cards?: number
          refreshed_at?: string
          role_multiplier?: number | null
          saves?: number
          sub_status?: string
          team_id?: string
          voto_base?: number | null
          yellow_cards?: number
          z_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_player_scores_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_player_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_player_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_scores: {
        Row: {
          league_id: string
          matchday_id: string
          nv_count: number
          player_count: number
          refreshed_at: string
          team_id: string
          total_fantavoto: number
        }
        Insert: {
          league_id: string
          matchday_id: string
          nv_count?: number
          player_count?: number
          refreshed_at?: string
          team_id: string
          total_fantavoto?: number
        }
        Update: {
          league_id?: string
          matchday_id?: string
          nv_count?: number
          player_count?: number
          refreshed_at?: string
          team_id?: string
          total_fantavoto?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_scores_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_current_calculation: {
        Row: {
          matchday_id: string
          run_id: string
          updated_at: string
        }
        Insert: {
          matchday_id: string
          run_id: string
          updated_at?: string
        }
        Update: {
          matchday_id?: string
          run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchday_current_calculation_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: true
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_current_calculation_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_fixtures: {
        Row: {
          created_at: string
          id: string
          kickoff_at: string | null
          label: string
          matchday_id: string
          sportmonks_fixture_id: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          kickoff_at?: string | null
          label?: string
          matchday_id: string
          sportmonks_fixture_id?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          kickoff_at?: string | null
          label?: string
          matchday_id?: string
          sportmonks_fixture_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matchday_fixtures_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_lineups: {
        Row: {
          bench: Json
          created_at: string
          id: string
          league_id: string
          matchday_id: string
          run_id: string
          starters: Json
          team_id: string
        }
        Insert: {
          bench?: Json
          created_at?: string
          id?: string
          league_id: string
          matchday_id: string
          run_id: string
          starters?: Json
          team_id: string
        }
        Update: {
          bench?: Json
          created_at?: string
          id?: string
          league_id?: string
          matchday_id?: string
          run_id?: string
          starters?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchday_lineups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_lineups_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_lineups_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_player_ownership: {
        Row: {
          created_at: string
          id: string
          matchday_id: string
          ownership_pct: number
          player_id: string
          teams_owning: number
          teams_total: number
        }
        Insert: {
          created_at?: string
          id?: string
          matchday_id: string
          ownership_pct: number
          player_id: string
          teams_owning: number
          teams_total: number
        }
        Update: {
          created_at?: string
          id?: string
          matchday_id?: string
          ownership_pct?: number
          player_id?: string
          teams_owning?: number
          teams_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "matchday_player_ownership_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_player_ownership_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_player_prices: {
        Row: {
          created_at: string
          id: string
          matchday_id: string
          player_id: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          matchday_id: string
          player_id: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          matchday_id?: string
          player_id?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchday_player_prices_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_player_prices_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
        ]
      }
      matchday_status_log: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          matchday_id: string
          new_status: Database["public"]["Enums"]["matchday_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["matchday_status"] | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          matchday_id: string
          new_status: Database["public"]["Enums"]["matchday_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["matchday_status"] | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          matchday_id?: string
          new_status?: Database["public"]["Enums"]["matchday_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["matchday_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "matchday_status_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchday_status_log_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      matchdays: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_frozen: boolean
          league_id: string
          locks_at: string | null
          matchday_number: number | null
          name: string
          opens_at: string | null
          round_number: number | null
          status: Database["public"]["Enums"]["matchday_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_frozen?: boolean
          league_id: string
          locks_at?: string | null
          matchday_number?: number | null
          name: string
          opens_at?: string | null
          round_number?: number | null
          status?: Database["public"]["Enums"]["matchday_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_frozen?: boolean
          league_id?: string
          locks_at?: string | null
          matchday_number?: number | null
          name?: string
          opens_at?: string | null
          round_number?: number | null
          status?: Database["public"]["Enums"]["matchday_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchdays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchdays_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      player_calculations: {
        Row: {
          b0: number | null
          b1: number | null
          bonus_malus_breakdown: Json | null
          calculated_at: string
          defensive_correction: number | null
          fantavoto: number | null
          id: string
          is_override: boolean
          is_provisional: boolean
          matchday_id: string
          minutes_factor: number | null
          mvp_bonus_amount: number | null
          mvp_bonus_pct: number | null
          override_id: string | null
          ownership_pct: number | null
          player_id: string
          popularity_penalty_amount: number | null
          popularity_penalty_pct: number | null
          raw_subtotal: number | null
          role_multiplier: number | null
          run_id: string
          stats_id: string
          total_bonus_malus: number | null
          voto_base: number | null
          weights_used: Json | null
          z_adjusted: number | null
          z_combined: number | null
          z_rating: number | null
        }
        Insert: {
          b0?: number | null
          b1?: number | null
          bonus_malus_breakdown?: Json | null
          calculated_at?: string
          defensive_correction?: number | null
          fantavoto?: number | null
          id?: string
          is_override?: boolean
          is_provisional?: boolean
          matchday_id: string
          minutes_factor?: number | null
          mvp_bonus_amount?: number | null
          mvp_bonus_pct?: number | null
          override_id?: string | null
          ownership_pct?: number | null
          player_id: string
          popularity_penalty_amount?: number | null
          popularity_penalty_pct?: number | null
          raw_subtotal?: number | null
          role_multiplier?: number | null
          run_id: string
          stats_id: string
          total_bonus_malus?: number | null
          voto_base?: number | null
          weights_used?: Json | null
          z_adjusted?: number | null
          z_combined?: number | null
          z_rating?: number | null
        }
        Update: {
          b0?: number | null
          b1?: number | null
          bonus_malus_breakdown?: Json | null
          calculated_at?: string
          defensive_correction?: number | null
          fantavoto?: number | null
          id?: string
          is_override?: boolean
          is_provisional?: boolean
          matchday_id?: string
          minutes_factor?: number | null
          mvp_bonus_amount?: number | null
          mvp_bonus_pct?: number | null
          override_id?: string | null
          ownership_pct?: number | null
          player_id?: string
          popularity_penalty_amount?: number | null
          popularity_penalty_pct?: number | null
          raw_subtotal?: number | null
          role_multiplier?: number | null
          run_id?: string
          stats_id?: string
          total_bonus_malus?: number | null
          voto_base?: number | null
          weights_used?: Json | null
          z_adjusted?: number | null
          z_combined?: number | null
          z_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_calculations_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_override_id_fkey"
            columns: ["override_id"]
            isOneToOne: false
            referencedRelation: "score_overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_calculations_stats_id_fkey"
            columns: ["stats_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          accurate_long_balls: number | null
          accurate_passes: number | null
          aerial_duels_won: number
          aerial_lost: number | null
          aerial_won: number | null
          assists: number
          ball_carries: number | null
          ball_recoveries: number | null
          big_chance_created: number
          big_chance_missed: number
          blocked_scoring_attempt: number | null
          blocks: number
          clean_sheet: boolean
          clearances: number
          completed_passes: number | null
          created_at: string
          dispossessed: number | null
          dribble_attempts: number
          dribble_success_rate: number | null
          dribbled_past: number
          duel_lost: number | null
          duel_won: number | null
          entered_by: string | null
          error_leading_to_goal: number
          expected_assists: number | null
          final_third_passes: number | null
          fouls_committed: number | null
          goals_conceded: number
          goals_scored: number
          has_decisive_event: boolean
          height: number | null
          id: string
          interceptions: number
          is_mvp: boolean
          is_provisional: boolean
          key_passes: number | null
          market_value: number | null
          matchday_id: string
          minutes_played: number
          own_goals: number
          pass_accuracy: number | null
          penalties_missed: number
          penalties_saved: number
          penalties_scored: number
          player_id: string
          possession_lost_ctrl: number | null
          progressive_carries: number | null
          progressive_passes: number | null
          rating: number | null
          rating_class_override:
            | Database["public"]["Enums"]["rating_class"]
            | null
          red_cards: number
          saves: number
          shots: number
          shots_on_target: number
          sportmonks_raw_stats: Json | null
          successful_dribbles: number | null
          tackles_won: number
          total_crosses: number | null
          total_long_balls: number | null
          total_passes: number | null
          total_tackles: number | null
          touches: number | null
          updated_at: string
          was_fouled: number | null
          xa: number | null
          xg: number | null
          yellow_cards: number
        }
        Insert: {
          accurate_long_balls?: number | null
          accurate_passes?: number | null
          aerial_duels_won?: number
          aerial_lost?: number | null
          aerial_won?: number | null
          assists?: number
          ball_carries?: number | null
          ball_recoveries?: number | null
          big_chance_created?: number
          big_chance_missed?: number
          blocked_scoring_attempt?: number | null
          blocks?: number
          clean_sheet?: boolean
          clearances?: number
          completed_passes?: number | null
          created_at?: string
          dispossessed?: number | null
          dribble_attempts?: number
          dribble_success_rate?: number | null
          dribbled_past?: number
          duel_lost?: number | null
          duel_won?: number | null
          entered_by?: string | null
          error_leading_to_goal?: number
          expected_assists?: number | null
          final_third_passes?: number | null
          fouls_committed?: number | null
          goals_conceded?: number
          goals_scored?: number
          has_decisive_event?: boolean
          height?: number | null
          id?: string
          interceptions?: number
          is_mvp?: boolean
          is_provisional?: boolean
          key_passes?: number | null
          market_value?: number | null
          matchday_id: string
          minutes_played?: number
          own_goals?: number
          pass_accuracy?: number | null
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id: string
          possession_lost_ctrl?: number | null
          progressive_carries?: number | null
          progressive_passes?: number | null
          rating?: number | null
          rating_class_override?:
            | Database["public"]["Enums"]["rating_class"]
            | null
          red_cards?: number
          saves?: number
          shots?: number
          shots_on_target?: number
          sportmonks_raw_stats?: Json | null
          successful_dribbles?: number | null
          tackles_won?: number
          total_crosses?: number | null
          total_long_balls?: number | null
          total_passes?: number | null
          total_tackles?: number | null
          touches?: number | null
          updated_at?: string
          was_fouled?: number | null
          xa?: number | null
          xg?: number | null
          yellow_cards?: number
        }
        Update: {
          accurate_long_balls?: number | null
          accurate_passes?: number | null
          aerial_duels_won?: number
          aerial_lost?: number | null
          aerial_won?: number | null
          assists?: number
          ball_carries?: number | null
          ball_recoveries?: number | null
          big_chance_created?: number
          big_chance_missed?: number
          blocked_scoring_attempt?: number | null
          blocks?: number
          clean_sheet?: boolean
          clearances?: number
          completed_passes?: number | null
          created_at?: string
          dispossessed?: number | null
          dribble_attempts?: number
          dribble_success_rate?: number | null
          dribbled_past?: number
          duel_lost?: number | null
          duel_won?: number | null
          entered_by?: string | null
          error_leading_to_goal?: number
          expected_assists?: number | null
          final_third_passes?: number | null
          fouls_committed?: number | null
          goals_conceded?: number
          goals_scored?: number
          has_decisive_event?: boolean
          height?: number | null
          id?: string
          interceptions?: number
          is_mvp?: boolean
          is_provisional?: boolean
          key_passes?: number | null
          market_value?: number | null
          matchday_id?: string
          minutes_played?: number
          own_goals?: number
          pass_accuracy?: number | null
          penalties_missed?: number
          penalties_saved?: number
          penalties_scored?: number
          player_id?: string
          possession_lost_ctrl?: number | null
          progressive_carries?: number | null
          progressive_passes?: number | null
          rating?: number | null
          rating_class_override?:
            | Database["public"]["Enums"]["rating_class"]
            | null
          red_cards?: number
          saves?: number
          shots?: number
          shots_on_target?: number
          sportmonks_raw_stats?: Json | null
          successful_dribbles?: number | null
          tackles_won?: number
          total_crosses?: number | null
          total_long_balls?: number | null
          total_passes?: number | null
          total_tackles?: number | null
          touches?: number | null
          updated_at?: string
          was_fouled?: number | null
          xa?: number | null
          xg?: number | null
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_role_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_mantra_roles: string[] | null
          new_rating_class: Database["public"]["Enums"]["rating_class"] | null
          old_mantra_roles: string[] | null
          old_rating_class: Database["public"]["Enums"]["rating_class"] | null
          player_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_mantra_roles?: string[] | null
          new_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          old_mantra_roles?: string[] | null
          old_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          player_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_mantra_roles?: string[] | null
          new_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          old_mantra_roles?: string[] | null
          old_rating_class?: Database["public"]["Enums"]["rating_class"] | null
          player_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_role_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_role_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_super_admin: boolean
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_super_admin?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_super_admin?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      published_team_scores: {
        Row: {
          id: string
          league_id: string
          matchday_id: string
          nv_count: number
          player_count: number
          published_at: string
          run_id: string
          team_id: string
          total_fantavoto: number
        }
        Insert: {
          id?: string
          league_id: string
          matchday_id: string
          nv_count?: number
          player_count?: number
          published_at?: string
          run_id: string
          team_id: string
          total_fantavoto: number
        }
        Update: {
          id?: string
          league_id?: string
          matchday_id?: string
          nv_count?: number
          player_count?: number
          published_at?: string
          run_id?: string
          team_id?: string
          total_fantavoto?: number
        }
        Relationships: [
          {
            foreignKeyName: "published_team_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_team_scores_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_team_scores_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_team_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      role_classification_rules: {
        Row: {
          default_rating_class: Database["public"]["Enums"]["rating_class"]
          id: string
          league_id: string
          mantra_role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_rating_class: Database["public"]["Enums"]["rating_class"]
          id?: string
          league_id: string
          mantra_role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_rating_class?: Database["public"]["Enums"]["rating_class"]
          id?: string
          league_id?: string
          mantra_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_classification_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_classification_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_import_batches: {
        Row: {
          created_at: string
          error_count: number
          filename: string
          id: string
          import_summary: Json | null
          imported_by: string
          league_id: string
          row_count: number
          storage_path: string | null
          success_count: number
        }
        Insert: {
          created_at?: string
          error_count?: number
          filename: string
          id?: string
          import_summary?: Json | null
          imported_by: string
          league_id: string
          row_count?: number
          storage_path?: string | null
          success_count?: number
        }
        Update: {
          created_at?: string
          error_count?: number
          filename?: string
          id?: string
          import_summary?: Json | null
          imported_by?: string
          league_id?: string
          row_count?: number
          storage_path?: string | null
          success_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "roster_import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_import_batches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      score_overrides: {
        Row: {
          created_at: string
          created_by: string
          id: string
          matchday_id: string
          original_fantavoto: number | null
          override_fantavoto: number
          player_id: string
          reason: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          matchday_id: string
          original_fantavoto?: number | null
          override_fantavoto: number
          player_id: string
          reason: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          matchday_id?: string
          original_fantavoto?: number | null
          override_fantavoto?: number
          player_id?: string
          reason?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_overrides_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_overrides_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_overrides_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      serie_a_players: {
        Row: {
          club: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          mantra_roles: string[]
          rating_class: string
          search_name: string | null
          season: string
          sportmonks_player_id: number | null
          updated_at: string
        }
        Insert: {
          club: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          mantra_roles?: string[]
          rating_class: string
          search_name?: string | null
          season?: string
          sportmonks_player_id?: number | null
          updated_at?: string
        }
        Update: {
          club?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          mantra_roles?: string[]
          rating_class?: string
          search_name?: string | null
          season?: string
          sportmonks_player_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sportmonks_fixtures: {
        Row: {
          away_team_id: number | null
          away_team_name: string | null
          fetched_at: string
          home_team_id: number | null
          home_team_name: string | null
          kickoff_at: string
          league_id: number
          length_minutes: number | null
          raw_payload: Json | null
          round_id: number | null
          season_id: number | null
          sportmonks_fixture_id: number
          stage_id: number | null
          state_id: number | null
          state_name: string | null
          updated_at: string
        }
        Insert: {
          away_team_id?: number | null
          away_team_name?: string | null
          fetched_at?: string
          home_team_id?: number | null
          home_team_name?: string | null
          kickoff_at: string
          league_id: number
          length_minutes?: number | null
          raw_payload?: Json | null
          round_id?: number | null
          season_id?: number | null
          sportmonks_fixture_id: number
          stage_id?: number | null
          state_id?: number | null
          state_name?: string | null
          updated_at?: string
        }
        Update: {
          away_team_id?: number | null
          away_team_name?: string | null
          fetched_at?: string
          home_team_id?: number | null
          home_team_name?: string | null
          kickoff_at?: string
          league_id?: number
          length_minutes?: number | null
          raw_payload?: Json | null
          round_id?: number | null
          season_id?: number | null
          sportmonks_fixture_id?: number
          stage_id?: number | null
          state_id?: number | null
          state_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      standings_snapshots: {
        Row: {
          calculated_at: string
          id: string
          league_id: string
          matchday_id: string
          published_at: string | null
          snapshot_json: Json
          version_number: number
        }
        Insert: {
          calculated_at?: string
          id?: string
          league_id: string
          matchday_id: string
          published_at?: string | null
          snapshot_json: Json
          version_number?: number
        }
        Update: {
          calculated_at?: string
          id?: string
          league_id?: string
          matchday_id?: string
          published_at?: string | null
          snapshot_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_snapshots_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      team_roster_entries: {
        Row: {
          acquired_at: string
          id: string
          import_batch_id: string | null
          player_id: string
          released_at: string | null
          team_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          import_batch_id?: string | null
          player_id: string
          released_at?: string | null
          team_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          import_batch_id?: string | null
          player_id?: string
          released_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_roster_entries_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "roster_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_roster_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_roster_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_league: {
        Args: { p_name: string; p_season_name: string }
        Returns: string
      }
      fm_get_user_team_id: {
        Args: { p_league_competition_id: string }
        Returns: string
      }
      fm_is_competition_member: {
        Args: { p_league_competition_id: string }
        Returns: boolean
      }
      fm_phase_is_revealed: { Args: { p_phase_id: string }; Returns: boolean }
      fm_round_is_published: { Args: { p_round_id: string }; Returns: boolean }
      fm_round_is_revealed: { Args: { p_round_id: string }; Returns: boolean }
      get_user_team_id: { Args: { p_league_id: string }; Returns: string }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      is_league_admin: { Args: { p_league_id: string }; Returns: boolean }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_lineup: {
        Args: {
          p_actor_user_id: string
          p_assignments: Json
          p_formation_id: string
          p_is_draft: boolean
          p_matchday_id: string
          p_source_ip: string
          p_team_id: string
        }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      audit_action:
        | "roster_import"
        | "roster_edit"
        | "player_create"
        | "player_role_change"
        | "player_rating_class_change"
        | "player_transfer"
        | "matchday_create"
        | "matchday_status_change"
        | "matchday_reopen"
        | "lineup_save"
        | "lineup_submit"
        | "lineup_lock"
        | "stats_edit"
        | "ratings_edit"
        | "calculation_draft"
        | "calculation_publish"
        | "override_create"
        | "override_remove"
        | "league_settings_change"
        | "formation_settings_change"
        | "ambiguous_role_change"
        | "user_role_change"
        | "rosa_assign"
        | "rosa_release"
        | "pool_import"
        | "competition_create"
        | "competition_status_change"
        | "competition_round_compute"
        | "competition_calendario_generate"
      calculation_status: "draft" | "provisional" | "published"
      competition_status: "setup" | "active" | "completed" | "cancelled"
      competition_type: "campionato" | "battle_royale" | "coppa"
      display_rounding: "one_decimal" | "nearest_half"
      fixture_result: "home_win" | "away_win" | "draw"
      fm_audit_action:
        | "competition_create"
        | "phase_create"
        | "phase_lock"
        | "phase_unlock"
        | "round_create"
        | "round_lock"
        | "round_unlock"
        | "round_publish"
        | "team_create"
        | "team_eliminate"
        | "team_reactivate"
        | "player_create"
        | "player_update"
        | "player_eliminate"
        | "coach_create"
        | "coach_update"
        | "coach_tier_change"
        | "price_update"
        | "price_bulk_import"
        | "squad_save"
        | "squad_submit"
        | "squad_admin_edit"
        | "lineup_save"
        | "lineup_submit"
        | "lineup_admin_edit"
        | "ratings_ingest"
        | "stats_edit"
        | "score_calculate"
        | "score_publish"
        | "config_change"
      fm_budget_mode: "fixed" | "reward_leaders" | "comeback"
      fm_calc_order: "mvp_then_penalty" | "penalty_then_mvp"
      fm_competition_kind: "national_team" | "club_international"
      fm_competition_status:
        | "draft"
        | "open"
        | "in_progress"
        | "completed"
        | "archived"
      fm_league_competition_status: "active" | "archived"
      fm_lineup_status: "draft" | "submitted" | "locked"
      fm_match_result: "home_win" | "draw" | "away_win"
      fm_match_status: "scheduled" | "in_progress" | "finished" | "cancelled"
      fm_phase_kind:
        | "group_stage"
        | "round_of_32"
        | "round_of_16"
        | "quarter_final"
        | "semi_final"
        | "final"
      fm_phase_status: "draft" | "open" | "locked" | "completed"
      fm_player_role: "P" | "D" | "C" | "A"
      fm_round_status: "draft" | "open" | "locked" | "scoring" | "published"
      fm_squad_status: "draft" | "submitted" | "locked"
      fm_team_status: "active" | "eliminated"
      fm_team_tier: "tier_1" | "tier_2" | "tier_3" | "tier_4"
      league_role: "league_admin" | "manager"
      lineup_status: "draft" | "submitted"
      lock_behavior: "auto" | "manual"
      matchday_status:
        | "draft"
        | "open"
        | "locked"
        | "scoring"
        | "published"
        | "archived"
        | "closed"
      rating_class: "GK" | "DEF" | "MID" | "ATT"
      round_status: "pending" | "computed" | "locked"
      scoring_mode: "head_to_head" | "points_only" | "both"
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
      audit_action: [
        "roster_import",
        "roster_edit",
        "player_create",
        "player_role_change",
        "player_rating_class_change",
        "player_transfer",
        "matchday_create",
        "matchday_status_change",
        "matchday_reopen",
        "lineup_save",
        "lineup_submit",
        "lineup_lock",
        "stats_edit",
        "ratings_edit",
        "calculation_draft",
        "calculation_publish",
        "override_create",
        "override_remove",
        "league_settings_change",
        "formation_settings_change",
        "ambiguous_role_change",
        "user_role_change",
        "rosa_assign",
        "rosa_release",
        "pool_import",
        "competition_create",
        "competition_status_change",
        "competition_round_compute",
        "competition_calendario_generate",
      ],
      calculation_status: ["draft", "provisional", "published"],
      competition_status: ["setup", "active", "completed", "cancelled"],
      competition_type: ["campionato", "battle_royale", "coppa"],
      display_rounding: ["one_decimal", "nearest_half"],
      fixture_result: ["home_win", "away_win", "draw"],
      fm_audit_action: [
        "competition_create",
        "phase_create",
        "phase_lock",
        "phase_unlock",
        "round_create",
        "round_lock",
        "round_unlock",
        "round_publish",
        "team_create",
        "team_eliminate",
        "team_reactivate",
        "player_create",
        "player_update",
        "player_eliminate",
        "coach_create",
        "coach_update",
        "coach_tier_change",
        "price_update",
        "price_bulk_import",
        "squad_save",
        "squad_submit",
        "squad_admin_edit",
        "lineup_save",
        "lineup_submit",
        "lineup_admin_edit",
        "ratings_ingest",
        "stats_edit",
        "score_calculate",
        "score_publish",
        "config_change",
      ],
      fm_budget_mode: ["fixed", "reward_leaders", "comeback"],
      fm_calc_order: ["mvp_then_penalty", "penalty_then_mvp"],
      fm_competition_kind: ["national_team", "club_international"],
      fm_competition_status: [
        "draft",
        "open",
        "in_progress",
        "completed",
        "archived",
      ],
      fm_league_competition_status: ["active", "archived"],
      fm_lineup_status: ["draft", "submitted", "locked"],
      fm_match_result: ["home_win", "draw", "away_win"],
      fm_match_status: ["scheduled", "in_progress", "finished", "cancelled"],
      fm_phase_kind: [
        "group_stage",
        "round_of_32",
        "round_of_16",
        "quarter_final",
        "semi_final",
        "final",
      ],
      fm_phase_status: ["draft", "open", "locked", "completed"],
      fm_player_role: ["P", "D", "C", "A"],
      fm_round_status: ["draft", "open", "locked", "scoring", "published"],
      fm_squad_status: ["draft", "submitted", "locked"],
      fm_team_status: ["active", "eliminated"],
      fm_team_tier: ["tier_1", "tier_2", "tier_3", "tier_4"],
      league_role: ["league_admin", "manager"],
      lineup_status: ["draft", "submitted"],
      lock_behavior: ["auto", "manual"],
      matchday_status: [
        "draft",
        "open",
        "locked",
        "scoring",
        "published",
        "archived",
        "closed",
      ],
      rating_class: ["GK", "DEF", "MID", "ATT"],
      round_status: ["pending", "computed", "locked"],
      scoring_mode: ["head_to_head", "points_only", "both"],
    },
  },
} as const


export type AuditAction = Database["public"]["Enums"]["audit_action"]
export type RatingClass = Database["public"]["Enums"]["rating_class"]
export type MatchdayStatus = Database["public"]["Enums"]["matchday_status"]
export type LeagueRole = Database["public"]["Enums"]["league_role"]
export type CompetitionType = Database["public"]["Enums"]["competition_type"]

export type League = Database["public"]["Tables"]["leagues"]["Row"]
export type LeaguePlayer = Database["public"]["Tables"]["league_players"]["Row"]
export type Matchday = Database["public"]["Tables"]["matchdays"]["Row"]
export type MatchdayFixture = Database["public"]["Tables"]["matchday_fixtures"]["Row"]
export type Formation = Database["public"]["Tables"]["formations"]["Row"]
export type FormationSlot = Database["public"]["Tables"]["formation_slots"]["Row"]
export type FantasyTeam = Database["public"]["Tables"]["fantasy_teams"]["Row"]
export type Competition = Database["public"]["Tables"]["competitions"]["Row"]
export type CompetitionRound = Database["public"]["Tables"]["competition_rounds"]["Row"]
export type CompetitionFixture = Database["public"]["Tables"]["competition_fixtures"]["Row"]
export type CompetitionMatchup = Database["public"]["Tables"]["competition_matchups"]["Row"]
export type LeagueEngineConfig = Database["public"]["Tables"]["league_engine_config"]["Row"]
export type SerieAPlayer = Database["public"]["Tables"]["serie_a_players"]["Row"]

// FantaMondiale Statistico aliases

export type FMCompetition = Database["public"]["Tables"]["fm_competition"]["Row"]
export type FMLeagueCompetition = Database["public"]["Tables"]["fm_league_competition"]["Row"]
export type FMCompetitionConfigRow = Database["public"]["Tables"]["fm_competition_config"]["Row"]
export type FMNationalTeam = Database["public"]["Tables"]["fm_national_team"]["Row"]
export type FMPlayer = Database["public"]["Tables"]["fm_player"]["Row"]
export type FMCoach = Database["public"]["Tables"]["fm_coach"]["Row"]
export type FMPhase = Database["public"]["Tables"]["fm_phase"]["Row"]
export type FMPhasePlayerPrice = Database["public"]["Tables"]["fm_phase_player_price"]["Row"]
export type FMPhaseCoachTier = Database["public"]["Tables"]["fm_phase_coach_tier"]["Row"]
export type FMScoringRound = Database["public"]["Tables"]["fm_scoring_round"]["Row"]
export type FMRealMatch = Database["public"]["Tables"]["fm_real_match"]["Row"]
export type FMFantasyTeam = Database["public"]["Tables"]["fm_fantasy_team"]["Row"]
export type FMPhaseSquad = Database["public"]["Tables"]["fm_phase_squad"]["Row"]
export type FMPhaseSquadPlayer = Database["public"]["Tables"]["fm_phase_squad_player"]["Row"]
export type FMMatchdayLineup = Database["public"]["Tables"]["fm_matchday_lineup"]["Row"]
export type FMMatchdayLineupPlayer = Database["public"]["Tables"]["fm_matchday_lineup_player"]["Row"]
export type FMRoundPlayerOwnership = Database["public"]["Tables"]["fm_round_player_ownership"]["Row"]
export type FMPlayerMatchStats = Database["public"]["Tables"]["fm_player_match_stats"]["Row"]
export type FMPlayerMatchScore = Database["public"]["Tables"]["fm_player_match_score"]["Row"]
export type FMCoachMatchScore = Database["public"]["Tables"]["fm_coach_match_score"]["Row"]
export type FMFantasyTeamRoundScore = Database["public"]["Tables"]["fm_fantasy_team_round_score"]["Row"]
export type FMBattleRoyaleMatchup = Database["public"]["Tables"]["fm_battle_royale_matchup"]["Row"]
export type FMCompetitionStanding = Database["public"]["Tables"]["fm_competition_standing"]["Row"]
export type FMAuditLog = Database["public"]["Tables"]["fm_audit_log"]["Row"]

export type FMCompetitionStatus = Database["public"]["Enums"]["fm_competition_status"]
export type FMCompetitionKind = Database["public"]["Enums"]["fm_competition_kind"]
export type FMLeagueCompetitionStatus = Database["public"]["Enums"]["fm_league_competition_status"]
export type FMPhaseKind = Database["public"]["Enums"]["fm_phase_kind"]
export type FMPhaseStatus = Database["public"]["Enums"]["fm_phase_status"]
export type FMRoundStatus = Database["public"]["Enums"]["fm_round_status"]
export type FMPlayerRoleEnum = Database["public"]["Enums"]["fm_player_role"]
export type FMTeamStatus = Database["public"]["Enums"]["fm_team_status"]
export type FMTeamTierEnum = Database["public"]["Enums"]["fm_team_tier"]
export type FMBudgetModeEnum = Database["public"]["Enums"]["fm_budget_mode"]
export type FMSquadStatus = Database["public"]["Enums"]["fm_squad_status"]
export type FMLineupStatus = Database["public"]["Enums"]["fm_lineup_status"]
export type FMMatchStatus = Database["public"]["Enums"]["fm_match_status"]
export type FMMatchResult = Database["public"]["Enums"]["fm_match_result"]
export type FMCalcOrderEnum = Database["public"]["Enums"]["fm_calc_order"]
export type FMAuditAction = Database["public"]["Enums"]["fm_audit_action"]
export type FMCompetitionCoachTier = Database["public"]["Tables"]["fm_competition_coach_tier"]["Row"]

// Per-league fantasy layer aliases
export type FMLeaguePhase = Database["public"]["Tables"]["fm_league_phase"]["Row"]
export type FMLeaguePhasePlayerPrice = Database["public"]["Tables"]["fm_league_phase_player_price"]["Row"]
export type FMLeagueCompetitionConfig = Database["public"]["Tables"]["fm_league_competition_config"]["Row"]
