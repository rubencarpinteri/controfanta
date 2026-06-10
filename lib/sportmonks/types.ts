/**
 * SportMonks v3 Football API — narrow TypeScript types.
 * Derived from saved sample responses in _sandbox/sportmonks/.
 *
 * Only the fields we actually consume are typed; everything else
 * is left untyped so we can pass raw_payload around without
 * fighting the API's full surface area.
 */

/** Envelope present on every SportMonks response */
export type SMRateLimit = {
  resets_in_seconds: number
  remaining: number
  requested_entity: string
}

export type SMPagination = {
  count: number
  per_page: number
  has_more: boolean
  current_page: number
  next_page: string | null
}

export type SMEnvelope<T> = {
  data: T
  subscription?: unknown
  rate_limit: SMRateLimit
  timezone?: string
  message?: string
  pagination?: SMPagination
}

/** Position IDs returned by SportMonks. */
export type SMPositionId = 24 | 25 | 26 | 27
// 24=GK, 25=DEF, 26=MID, 27=ATT

export type SMPlayer = {
  id: number
  sport_id?: number
  country_id?: number | null
  nationality_id?: number | null
  position_id?: number | null
  detailed_position_id?: number | null
  type_id?: number | null
  common_name?: string | null
  firstname?: string | null
  lastname?: string | null
  name?: string | null
  display_name?: string | null
  image_path?: string | null
  height?: number | null
  weight?: number | null
  date_of_birth?: string | null
  gender?: string | null
}

export type SMParticipant = {
  id: number
  name: string
  short_code?: string | null
  image_path?: string | null
  meta?: {
    location?: 'home' | 'away'
    winner?: boolean | null
    position?: number | null
  }
}

export type SMStatType = {
  id: number
  name: string
  code: string
  developer_name: string
  model_type?: string
  stat_group?: string
}

export type SMStatDetail = {
  id: number
  fixture_id: number
  player_id: number
  team_id: number
  lineup_id: number
  type_id: number
  data: { value: number | string }
  type: SMStatType
}

/** A lineup entry — starter (type_id=11) or substitute (type_id=12). */
export type SMLineupEntry = {
  id: number
  sport_id: number
  fixture_id: number
  player_id: number
  team_id: number
  position_id: number | null
  formation_field: string | null
  type_id: number  // 11 = starter, 12 = sub
  formation_position: number | null
  player_name: string
  jersey_number: number | null
  player?: SMPlayer
  details?: SMStatDetail[]
}

/** Event types we care about (per SportMonks docs). */
export type SMEventType =
  | 'GOAL'
  | 'PENALTY'
  | 'MISSED_PENALTY'
  | 'OWN_GOAL'
  | 'YELLOWCARD'
  | 'REDCARD'
  | 'YELLOWREDCARD'
  | 'SUBSTITUTION'
  | 'PENALTY_SHOOTOUT_GOAL'
  | 'PENALTY_SHOOTOUT_MISS'
  | string  // tolerate unknown types

export type SMEvent = {
  id: number
  fixture_id: number
  period_id?: number | null
  participant_id: number  // team_id of the event "owner"
  type_id: number
  player_id: number | null
  related_player_id?: number | null
  player_name?: string | null
  minute?: number | null
  extra_minute?: number | null
  result?: string | null
  info?: string | null
  type?: { id: number; name: string; code: string; developer_name: SMEventType }
}

// Authoritative scoreline entry (include=scores). One CURRENT entry per
// participant carries the running total — used in preference to summing player
// GOALS, which silently omits own goals.
export type SMScore = {
  id?: number
  fixture_id?: number
  type_id?: number
  participant_id?: number
  score?: { goals?: number | null; participant?: string | null } | null
  description?: string | null
}

export type SMFixture = {
  id: number
  sport_id: number
  league_id: number
  scores?: SMScore[]
  season_id: number
  stage_id?: number | null
  group_id?: number | null
  round_id?: number | null
  state_id: number
  venue_id?: number | null
  name: string
  starting_at: string  // ISO with timezone offset implied UTC
  starting_at_timestamp?: number
  result_info?: string | null
  leg?: string | null
  length: number
  placeholder: boolean
  participants?: SMParticipant[]
  round?: {
    id: number
    sport_id: number
    league_id: number
    season_id: number
    stage_id: number
    name: string
    finished: boolean
    is_current: boolean
    starting_at: string
    ending_at: string
  } | null
  lineups?: SMLineupEntry[]
  events?: SMEvent[]
  statistics?: unknown[]
  state?: { id: number; state: string; name: string; short_name?: string }
}

export type SMSquadEntry = {
  id: number
  transfer_id?: number | null
  player_id: number
  team_id: number
  position_id: number | null
  detailed_position_id: number | null
  start: string | null
  end: string | null
  captain: boolean | null
  jersey_number: number | null
  player: SMPlayer
}

/**
 * Vendor-neutral parsed per-player stat row, ready to be persisted
 * into player_match_stats / fm_player_match_stats.
 */
export type ParsedPlayerStat = {
  sportmonks_player_id: number
  sportmonks_team_id: number
  position_id: number | null
  detailed_position_id: number | null
  rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number
  penalties_missed: number
  penalties_saved: number
  own_goals: number
  goals_conceded: number
  clean_sheet: boolean
  is_captain: boolean
  is_starter: boolean
  /** Highest-RATING player in the match per side; set after parse. */
  is_mvp: boolean
  /** Full SportMonks per-stat dump (all 60 developer_names) for archival. */
  raw_stats: Record<string, number | string | boolean>
}

export type ParsedFixture = {
  sportmonks_fixture_id: number
  league_id: number
  season_id: number
  stage_id: number | null
  round_id: number | null
  home_team_id: number | null
  away_team_id: number | null
  home_team_name: string | null
  away_team_name: string | null
  kickoff_at: string  // ISO UTC
  state_id: number
  state_name: string | null
  length_minutes: number
  home_score: number | null
  away_score: number | null
  /**
   * Match outcome from the SportMonks participant winner flag. For a level
   * knockout tie decided on penalties this names the side that advanced;
   * otherwise it agrees with the scoreline. Null when undecided (e.g. an
   * in-progress fixture with no winner flag yet).
   */
  result: 'home_win' | 'draw' | 'away_win' | null
  players: ParsedPlayerStat[]
}
