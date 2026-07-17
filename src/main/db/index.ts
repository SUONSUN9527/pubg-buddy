import Database from 'better-sqlite3'

export type DB = Database.Database

/** 按版本递增的迁移脚本;user_version 记录已执行到第几个 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE players (
    account_id TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    shard      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_players_name ON players(name, shard);
  CREATE TABLE seasons (
    id         TEXT PRIMARY KEY,
    is_current INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE season_stats (
    account_id TEXT NOT NULL,
    season_id  TEXT NOT NULL,
    game_mode  TEXT NOT NULL,
    stats_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, season_id, game_mode)
  );
  CREATE TABLE matches (
    id             TEXT PRIMARY KEY,
    shard          TEXT NOT NULL,
    map_name       TEXT,
    game_mode      TEXT,
    played_at      TEXT,
    duration       INTEGER,
    is_custom      INTEGER NOT NULL DEFAULT 0,
    telemetry_url  TEXT,
    telemetry_path TEXT,
    raw_json       TEXT NOT NULL,
    created_at     INTEGER NOT NULL
  );
  CREATE TABLE match_players (
    match_id     TEXT NOT NULL,
    account_id   TEXT,
    name         TEXT NOT NULL,
    roster_id    TEXT,
    team_rank    INTEGER,
    kills        INTEGER,
    damage       REAL,
    dbnos        INTEGER,
    survive_time REAL,
    win_place    INTEGER,
    PRIMARY KEY (match_id, name)
  );
  CREATE TABLE squad_members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    account_id TEXT,
    note       TEXT,
    sort       INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE map_markers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id     TEXT NOT NULL,
    type       TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    note       TEXT,
    source     TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('builtin','user','telemetry')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE poll_state (
    account_id    TEXT PRIMARY KEY,
    last_match_id TEXT,
    checked_at    INTEGER
  );
  `,
  // v2:telemetry 抽取结果(M6)
  `
  CREATE TABLE tele_meta (
    match_id  TEXT PRIMARY KEY,
    my_name   TEXT,
    parsed_at INTEGER NOT NULL
  );
  CREATE TABLE tele_landings (
    match_id TEXT NOT NULL,
    name     TEXT NOT NULL,
    x        REAL NOT NULL,
    y        REAL NOT NULL,
    is_me    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, name)
  );
  CREATE INDEX idx_tele_landings_me ON tele_landings(is_me, match_id);
  CREATE TABLE tele_kills (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    killer   TEXT,
    victim   TEXT NOT NULL,
    weapon   TEXT,
    distance REAL NOT NULL DEFAULT 0,
    x        REAL NOT NULL DEFAULT 0,
    y        REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_tele_kills_victim ON tele_kills(victim);
  `
]

export function openDatabase(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
