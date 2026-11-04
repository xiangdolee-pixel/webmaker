-- 슈가브레이크 D1 스키마. 기록은 지우지 않고(soft delete) 영구 보관한다.
CREATE TABLE IF NOT EXISTS records (
  id         TEXT PRIMARY KEY,           -- 클라이언트 생성 id (마이그레이션분은 'm'+t)
  type       TEXT NOT NULL,              -- weight | bp | waist | glucose | hba1c | workout
  date       TEXT NOT NULL,              -- YYYY-MM-DD
  t          INTEGER NOT NULL,           -- 기록 시각 (ms)
  data       TEXT NOT NULL,              -- {"v":79.3} / {"sys":114,"dia":67,"hr":65} 등
  deleted    INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_type_t ON records(type, t);

-- 날짜별 당류 체크 {"snack":"no","fruit":"no","drink":"yes"}
CREATE TABLE IF NOT EXISTS days (
  date       TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 설정: why, myGoal, goals, best
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
