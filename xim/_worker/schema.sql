-- xim D1 스키마. 적용: node xim/_worker/db.mjs (원격 xim DB 에 그대로 실행)
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS 만 쓴다.

CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,              -- 업체(고객) 이름
  contact     TEXT NOT NULL DEFAULT '',   -- 담당자
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  memo        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,       -- WebMaker2 폴더 이름 = Worker 이름
  name        TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  domain      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',  -- active | suspended
  quota_mb    INTEGER NOT NULL DEFAULT 500,
  used_mb     REAL NOT NULL DEFAULT 0,
  memo        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

-- 각 업체 사이트의 관리자 계정 (사이트 주소/admin 에서 로그인)
CREATE TABLE IF NOT EXISTS site_admins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  pw_hash     TEXT NOT NULL,
  pw_salt     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (site_id, username)
);

-- 수정(유지보수) 요청
CREATE TABLE IF NOT EXISTS requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  admin_id    INTEGER REFERENCES site_admins(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',  -- new | doing | done
  reply       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_site ON requests(site_id, created_at);

-- 로그인 세션. kind = xim(운영자) | site(업체 관리자)
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  site_id     INTEGER,
  admin_id    INTEGER,
  expires_at  INTEGER NOT NULL
);

-- 로그인 실패 기록(무차별 대입 막기)
CREATE TABLE IF NOT EXISTS login_fails (
  key         TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_fails ON login_fails(key, at);
