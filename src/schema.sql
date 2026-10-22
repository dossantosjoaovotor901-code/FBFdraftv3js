-- =====================================================================
--  FBF - Esquema do banco (SQLite). Idempotente: roda em todo start.
--  Mesmas tabelas/colunas do esquema anterior (snake_case), para o front nao mudar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id    TEXT UNIQUE NOT NULL,
  username      TEXT NOT NULL,
  global_name   TEXT,
  avatar        TEXT,
  email         TEXT,
  coins         INTEGER NOT NULL DEFAULT 0,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  initial_reward_given INTEGER NOT NULL DEFAULT 0,
  main_team_id  INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_seen     TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  short_name  TEXT,
  crest       TEXT,
  country     TEXT,
  league      TEXT,
  color_primary   TEXT,
  color_secondary TEXT,
  description TEXT,
  kit_style   TEXT DEFAULT 'vertical',
  kit_text_color TEXT DEFAULT '#ffffff',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS rarities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  rank        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS card_models (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  rarity_id   INTEGER REFERENCES rarities(id),
  bg_from     TEXT,
  bg_to       TEXT,
  border_color TEXT,
  text_color  TEXT,
  effect      TEXT,
  logo        TEXT,
  pattern     TEXT,
  layout      TEXT,
  accent_color TEXT,
  name_bg     TEXT,
  shine_color TEXT,
  bg_anim     TEXT DEFAULT 'none',
  bg_anim_color TEXT,
  bg_anim_speed INTEGER DEFAULT 2,
  bg_image    TEXT,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  photo       TEXT,
  overall     INTEGER NOT NULL DEFAULT 50,
  position    TEXT NOT NULL,
  positions   TEXT,
  country     TEXT,
  team_id     INTEGER REFERENCES teams(id),
  rarity_id   INTEGER REFERENCES rarities(id),
  model_id    INTEGER REFERENCES card_models(id),
  is_gk       INTEGER NOT NULL DEFAULT 0,
  fin INTEGER DEFAULT 0, pas INTEGER DEFAULT 0, ctl INTEGER DEFAULT 0,
  skl INTEGER DEFAULT 0, def INTEGER DEFAULT 0, jdc INTEGER DEFAULT 0,
  pac INTEGER DEFAULT 0, sho INTEGER DEFAULT 0, dri INTEGER DEFAULT 0, phy INTEGER DEFAULT 0,
  gk_div INTEGER DEFAULT 0, gk_han INTEGER DEFAULT 0, gk_kic INTEGER DEFAULT 0,
  gk_ref INTEGER DEFAULT 0, gk_spd INTEGER DEFAULT 0, gk_pos INTEGER DEFAULT 0,
  exp_x3 INTEGER DEFAULT 50, exp_x4 INTEGER DEFAULT 50, exp_x5 INTEGER DEFAULT 50, exp_x7 INTEGER DEFAULT 50,
  avatar_mode  TEXT DEFAULT 'auto',
  avatar_style TEXT DEFAULT 'team',
  avatar_text  TEXT,
  is_event     INTEGER DEFAULT 0,
  is_exclusive INTEGER DEFAULT 0,
  exclusive_max INTEGER,
  exclusive_resale INTEGER DEFAULT 1,
  exclusive_price  INTEGER,
  group_id    TEXT,
  card_type   TEXT,
  owner_user_id INTEGER,
  description TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_players_rarity ON players(rarity_id);
CREATE INDEX IF NOT EXISTS idx_players_owner ON players(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_players_group ON players(group_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);

CREATE TABLE IF NOT EXISTS user_cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  player_id   INTEGER NOT NULL REFERENCES players(id),
  acquired_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  source      TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_cards_user ON user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_player ON user_cards(player_id);

CREATE TABLE IF NOT EXISTS packs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  art         TEXT,
  price       INTEGER NOT NULL DEFAULT 0,
  card_count  INTEGER NOT NULL DEFAULT 1,
  rarity_odds TEXT,
  eligible_players TEXT,
  available_from TEXT,
  available_to   TEXT,
  is_event    INTEGER DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  color_from  TEXT,
  color_to    TEXT,
  color_accent TEXT,
  tag         TEXT,
  guaranteed_rarity_id INTEGER,
  guaranteed_count INTEGER DEFAULT 0,
  allow_dupes INTEGER DEFAULT 1,
  min_overall INTEGER DEFAULT 0,
  max_overall INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pack_openings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  pack_id     INTEGER NOT NULL REFERENCES packs(id),
  price_paid  INTEGER NOT NULL,
  cards_json  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS drafts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  formation   TEXT NOT NULL,
  slots_json  TEXT NOT NULL,
  rating      INTEGER,
  chemistry   INTEGER,
  mode        TEXT DEFAULT 'random',
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS user_squads (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  formation   TEXT,
  mode        TEXT,
  slots_json  TEXT,
  rating      INTEGER DEFAULT 0,
  chemistry   INTEGER DEFAULT 0,
  squad_name  TEXT,
  squad_crest TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  amount      INTEGER NOT NULL,
  reason      TEXT,
  type        TEXT,
  balance_after INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

CREATE TABLE IF NOT EXISTS market_listings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_card_id INTEGER NOT NULL UNIQUE REFERENCES user_cards(id),
  seller_id   INTEGER NOT NULL REFERENCES users(id),
  player_id   INTEGER NOT NULL REFERENCES players(id),
  price       INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  buyer_id    INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  sold_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);

CREATE TABLE IF NOT EXISTS admin_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS formations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slots_json  TEXT NOT NULL,
  mode        TEXT,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  opp_type    TEXT,
  opp_label   TEXT,
  my_goals    INTEGER,
  opp_goals   INTEGER,
  result      TEXT,
  reward      INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id, opp_type, id);

CREATE TABLE IF NOT EXISTS draft_reward_config (
  level       INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  strength    INTEGER NOT NULL,
  coins       INTEGER NOT NULL,
  pack_id     INTEGER,
  pack_label  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS draft_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'active',
  level        INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  coins_won    INTEGER NOT NULL DEFAULT 0,
  packs_won    INTEGER NOT NULL DEFAULT 0,
  formation    TEXT,
  slots_json   TEXT,
  rating       INTEGER DEFAULT 0,
  chemistry    INTEGER DEFAULT 0,
  ended_reason TEXT,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_pack_id INTEGER,
  reward_pack_label TEXT,
  reward_claimed INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_draft_runs_user ON draft_runs(user_id, status);

CREATE TABLE IF NOT EXISTS user_packs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  pack_id    INTEGER NOT NULL,
  source     TEXT,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  opened_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_packs_user ON user_packs(user_id, opened_at);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT,
  emoji         TEXT,
  bg_effect     TEXT DEFAULT 'none',
  theme_primary TEXT,
  theme_dark    TEXT,
  theme_light   TEXT,
  page_bg       TEXT,
  banner_text   TEXT,
  banner_bg     TEXT,
  banner_color  TEXT,
  pack_ids      TEXT,
  card_ids      TEXT,
  starts_at     TEXT,
  ends_at       TEXT,
  active        INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS market_shop (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  price       INTEGER NOT NULL,
  cycle       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  stock       INTEGER,
  sold        INTEGER NOT NULL DEFAULT 0,
  limit_per_user INTEGER,
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_market_shop_status ON market_shop(status, cycle);

CREATE TABLE IF NOT EXISTS shop_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_shop_purchases ON shop_purchases(kind, item_id, user_id);

CREATE TABLE IF NOT EXISTS shop_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  accent TEXT,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS shop_event_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES shop_events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  stock INTEGER,
  sold INTEGER NOT NULL DEFAULT 0,
  limit_per_user INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shop_event_items ON shop_event_items(event_id);

CREATE TABLE IF NOT EXISTS draft_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  formation_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  modality TEXT,
  slots_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_draft_sessions ON draft_sessions(user_id, status);

CREATE TABLE IF NOT EXISTS self_cards (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS selfcard_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  card_name TEXT,
  position TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  decided_at TEXT,
  decided_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_selfcard_orders ON selfcard_orders(status, created_at);

CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'selfcard',
  note TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  used_by INTEGER,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS bot_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  crest TEXT,
  strength INTEGER NOT NULL,
  attack INTEGER,
  defense INTEGER,
  gk INTEGER,
  chemistry INTEGER NOT NULL DEFAULT 40,
  reward INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  team_id INTEGER,
  card_ids TEXT
);

CREATE TABLE IF NOT EXISTS online_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  type TEXT NOT NULL,
  mode TEXT,
  status TEXT NOT NULL,
  p1_id INTEGER NOT NULL,
  p2_id INTEGER,
  p1_json TEXT,
  p2_json TEXT,
  deadline TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_online_rooms ON online_rooms(status, p1_id, p2_id);

CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- ---------- Lojinha premium (dinheiro real via Pix). price/promo_price em CENTAVOS ----------
CREATE TABLE IF NOT EXISTS cash_products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,            -- 'pack' | 'card' | 'coins'
  ref_id       INTEGER,
  title        TEXT NOT NULL,
  description  TEXT,
  image        TEXT,
  price        INTEGER NOT NULL DEFAULT 0,
  promo_price  INTEGER,
  promo_label  TEXT,
  badge        TEXT,
  qty          INTEGER NOT NULL DEFAULT 1,
  coins_amount INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_cash_products_active ON cash_products(active, sort);

CREATE TABLE IF NOT EXISTS cash_orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  product_id  INTEGER NOT NULL,
  title       TEXT,
  amount      INTEGER,
  proof_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  admin_note  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  decided_at  TEXT,
  decided_by  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cash_orders ON cash_orders(status, created_at);

CREATE TABLE IF NOT EXISTS ad_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  reward      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ad_views ON ad_views(user_id, created_at);
