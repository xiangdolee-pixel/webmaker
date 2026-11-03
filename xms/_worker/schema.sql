-- xms D1 스키마 (업체별 CMS: 회원 · 게시판 · 메뉴). 모든 표는 site(= xim 사이트 ID, 폴더 이름)로 업체를 나눈다.
-- 적용: node deploy.mjs --wrangler d1 execute xms --remote --file xms/_worker/schema.sql -y  (여러 번 실행해도 안전)

-- 업체별 설정: 등급 이름 · 가입 항목 (JSON)
CREATE TABLE IF NOT EXISTS site_settings (
  site          TEXT PRIMARY KEY,
  level_names   TEXT NOT NULL DEFAULT '{}',
  signup_fields TEXT NOT NULL DEFAULT '[]',
  updated_at    INTEGER NOT NULL DEFAULT 0
);

-- 회원 (등급 1 = 관리자: /admin 에 들어갈 수 있는 유일한 등급, 9 = 가입 기본, 10 = 제한)
CREATE TABLE IF NOT EXISTS members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  site            TEXT NOT NULL,
  login_id        TEXT NOT NULL,
  pw_hash         TEXT NOT NULL,
  pw_salt         TEXT NOT NULL,
  name            TEXT NOT NULL,
  nickname        TEXT NOT NULL DEFAULT '',
  level           INTEGER NOT NULL DEFAULT 9,
  email           TEXT NOT NULL DEFAULT '',
  mobile          TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  extra           TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | LOCKED | WITHDRAWN
  fail_count      INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER NOT NULL DEFAULT 0,        -- 로그인 5번 실패 → 15분 잠금
  last_login_at   INTEGER,
  created_at      INTEGER NOT NULL,
  withdrawn_at    INTEGER,
  withdraw_reason TEXT NOT NULL DEFAULT '',
  UNIQUE (site, login_id)
);
CREATE INDEX IF NOT EXISTS idx_members_site ON members(site, status, id);

-- 약관 · 개인정보 처리방침 (발행한 버전은 고치지 않는다)
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site         TEXT NOT NULL,
  doc_type     TEXT NOT NULL,          -- TERMS | PRIVACY
  version      INTEGER NOT NULL,
  content      TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  UNIQUE (site, doc_type, version)
);
CREATE TABLE IF NOT EXISTS member_agreements (
  member_id   INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  agreed_at   INTEGER NOT NULL,
  PRIMARY KEY (member_id, document_id)
);

-- 게시판 (권한 = 등급 1~9 비트 묶음: 등급 k → 비트 k-1, 511 = 전부)
CREATE TABLE IF NOT EXISTS boards (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  site              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  list_layout       TEXT NOT NULL DEFAULT 'TABLE',   -- TABLE | CARD | BLOG
  list_levels       INTEGER NOT NULL DEFAULT 511,
  read_levels       INTEGER NOT NULL DEFAULT 511,
  write_levels      INTEGER NOT NULL DEFAULT 1,
  comment_levels    INTEGER NOT NULL DEFAULT 511,
  allow_guest_list  INTEGER NOT NULL DEFAULT 1,
  allow_guest_read  INTEGER NOT NULL DEFAULT 1,
  allow_guest_write INTEGER NOT NULL DEFAULT 0,
  guest_menu        INTEGER NOT NULL DEFAULT 1,      -- 비회원에게도 메뉴 보이기
  use_comment       INTEGER NOT NULL DEFAULT 1,
  use_secret        INTEGER NOT NULL DEFAULT 0,
  options           TEXT NOT NULL DEFAULT '{}',
  sort              INTEGER NOT NULL DEFAULT 0,
  visible           INTEGER NOT NULL DEFAULT 1,
  deleted_at        INTEGER,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boards_site ON boards(site, deleted_at, sort);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site         TEXT NOT NULL,
  board_id     INTEGER NOT NULL,
  title        TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  is_notice    INTEGER NOT NULL DEFAULT 0,
  is_secret    INTEGER NOT NULL DEFAULT 0,
  writer_id    INTEGER,                 -- 비회원 글은 NULL
  writer_name  TEXT NOT NULL DEFAULT '',
  view_count   INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,        -- 미래 = 예약 발행(그때까지 숨김)
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_posts_board ON posts(board_id, deleted_at, is_notice, published_at);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site        TEXT NOT NULL,
  post_id     INTEGER NOT NULL,
  writer_id   INTEGER NOT NULL,
  writer_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);

-- 메뉴 (트리). menu_type = PAGE(사이트 안 주소) | BOARD | LINK(외부 주소)
CREATE TABLE IF NOT EXISTS menus (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  site             TEXT NOT NULL,
  parent_id        INTEGER,
  title            TEXT NOT NULL,
  menu_type        TEXT NOT NULL DEFAULT 'PAGE',
  path             TEXT NOT NULL DEFAULT '',
  board_id         INTEGER,
  sort             INTEGER NOT NULL DEFAULT 0,
  visible          INTEGER NOT NULL DEFAULT 1,
  read_levels      INTEGER,             -- NULL = 로그인한 회원 모두
  allow_guest_read INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_menus_site ON menus(site, parent_id, sort);

-- 로그인 세션. kind = member(회원 · 관리자) | staff(웹촌 직원이 xim 에서 대신 들어옴)
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  site       TEXT NOT NULL,
  member_id  INTEGER,
  kind       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- xim 의 "관리 화면 열기" 가 만드는 1회용 입장권 (1분)
CREATE TABLE IF NOT EXISTS staff_tickets (
  token      TEXT PRIMARY KEY,
  site       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 관리 로그 (지우지 않는다)
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site       TEXT NOT NULL,
  actor_kind TEXT NOT NULL,              -- admin | staff
  actor_name TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_site ON audit_log(site, id);

-- 아이디 단위가 아닌 IP 단위 무차별 대입 막기
CREATE TABLE IF NOT EXISTS login_fails (
  key TEXT NOT NULL,
  at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xms_login_fails ON login_fails(key, at);
