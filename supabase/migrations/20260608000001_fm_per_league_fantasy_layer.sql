-- Per-league fantasy layer for ControFanta Mondiale.
--
-- The World Cup template (fm_competition + pool + fm_phase timing/stages +
-- fm_scoring_round + fixtures + raw scoring) stays GLOBAL and super-admin-owned:
-- the same match must yield the same player points for every Lega.
--
-- The *fantasy* layer layered on top becomes PER-LEAGUE and league-admin-owned:
--   * fm_league_phase             — redraft cadence + budget per phase
--   * fm_league_phase_player_price — prices
--   * fm_league_competition_config — squad/formations/popularity/MVP/tie-break rules
--
-- All three are keyed by fm_league_competition.id and writable by the owning
-- Lega's league_admin (RLS mirrors fm_league_competition from 20260526000001).
-- Existing enrolled Leghe are backfilled from the current global rows so their
-- behavior is byte-for-byte unchanged.

-- ── 1. Redraft cadence + budget per phase ──────────────────────────────────
CREATE TABLE fm_league_phase (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_competition_id uuid NOT NULL REFERENCES fm_league_competition(id) ON DELETE CASCADE,
  phase_id              uuid NOT NULL REFERENCES fm_phase(id) ON DELETE CASCADE,
  requires_new_squad    boolean NOT NULL DEFAULT true,
  budget_mode           fm_budget_mode NOT NULL DEFAULT 'comeback',
  budget_config         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_competition_id, phase_id)
);
CREATE INDEX fm_league_phase_lc_idx ON fm_league_phase(league_competition_id);
CREATE INDEX fm_league_phase_phase_idx ON fm_league_phase(phase_id);

-- ── 2. Prices per phase, per Lega ──────────────────────────────────────────
CREATE TABLE fm_league_phase_player_price (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_competition_id uuid NOT NULL REFERENCES fm_league_competition(id) ON DELETE CASCADE,
  phase_id              uuid NOT NULL REFERENCES fm_phase(id) ON DELETE CASCADE,
  player_id             uuid NOT NULL REFERENCES fm_player(id) ON DELETE CASCADE,
  price                 int NOT NULL,
  source                text NOT NULL DEFAULT 'manual',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_competition_id, phase_id, player_id),
  CONSTRAINT chk_fm_league_price_nonneg CHECK (price >= 0)
);
CREATE INDEX fm_league_phase_price_lc_phase_idx
  ON fm_league_phase_player_price(league_competition_id, phase_id);

-- ── 3. Fantasy config per Lega ─────────────────────────────────────────────
-- Holds only the league-ownable subset of fm_competition_config.config
-- (squad, formations, budget_default, popularity_brackets, mvp_bonus_brackets,
-- tie_breakers, substitution). Read path falls back to the global config row
-- for any key absent here, and raw-scoring keys are never sourced from here.
CREATE TABLE fm_league_competition_config (
  league_competition_id uuid PRIMARY KEY REFERENCES fm_league_competition(id) ON DELETE CASCADE,
  config                jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- ── updated_at triggers (reuse the shared helper) ──────────────────────────
CREATE TRIGGER fm_league_phase_updated_at
  BEFORE UPDATE ON fm_league_phase
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER fm_league_phase_player_price_updated_at
  BEFORE UPDATE ON fm_league_phase_player_price
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER fm_league_competition_config_updated_at
  BEFORE UPDATE ON fm_league_competition_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- SELECT: super admin OR any member of the owning Lega.
-- WRITE:  super admin OR league_admin of the owning Lega.
-- Membership is resolved by joining through fm_league_competition → league_users.
ALTER TABLE fm_league_phase ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_league_phase_player_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_league_competition_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fm_league_phase: members read"
  ON fm_league_phase FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_phase.league_competition_id
        AND lu.user_id = auth.uid()
    )
  );
CREATE POLICY "fm_league_phase: league admin write"
  ON fm_league_phase FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_phase.league_competition_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_phase.league_competition_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

CREATE POLICY "fm_league_phase_player_price: members read"
  ON fm_league_phase_player_price FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_phase_player_price.league_competition_id
        AND lu.user_id = auth.uid()
    )
  );
CREATE POLICY "fm_league_phase_player_price: league admin write"
  ON fm_league_phase_player_price FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_phase_player_price.league_competition_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_phase_player_price.league_competition_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

CREATE POLICY "fm_league_competition_config: members read"
  ON fm_league_competition_config FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_competition_config.league_competition_id
        AND lu.user_id = auth.uid()
    )
  );
CREATE POLICY "fm_league_competition_config: league admin write"
  ON fm_league_competition_config FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_competition_config.league_competition_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM fm_league_competition flc
      JOIN league_users lu ON lu.league_id = flc.league_id
      WHERE flc.id = fm_league_competition_config.league_competition_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

-- ── Backfill existing enrolled Leghe from the current global rows ───────────
-- Redraft cadence + budget: copy every global phase into each Lega instance.
INSERT INTO fm_league_phase (league_competition_id, phase_id, requires_new_squad, budget_mode, budget_config)
SELECT flc.id, p.id, p.requires_new_squad, p.budget_mode, p.budget_config
FROM fm_league_competition flc
JOIN fm_phase p ON p.competition_id = flc.fm_competition_id
ON CONFLICT (league_competition_id, phase_id) DO NOTHING;

-- Prices: copy every global phase price into each Lega instance.
INSERT INTO fm_league_phase_player_price (league_competition_id, phase_id, player_id, price, source)
SELECT flc.id, ppp.phase_id, ppp.player_id, ppp.price, ppp.source
FROM fm_league_competition flc
JOIN fm_phase p ON p.competition_id = flc.fm_competition_id
JOIN fm_phase_player_price ppp ON ppp.phase_id = p.id
ON CONFLICT (league_competition_id, phase_id, player_id) DO NOTHING;

-- Fantasy config: copy the global config blob into each Lega instance.
INSERT INTO fm_league_competition_config (league_competition_id, config)
SELECT flc.id, COALESCE(cc.config, '{}'::jsonb)
FROM fm_league_competition flc
LEFT JOIN fm_competition_config cc ON cc.competition_id = flc.fm_competition_id
ON CONFLICT (league_competition_id) DO NOTHING;
