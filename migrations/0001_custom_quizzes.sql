PRAGMA foreign_keys = ON;
CREATE TABLE profiles (id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_sign_in_at INTEGER);
CREATE TABLE quizzes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profiles(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', questions_json TEXT NOT NULL, seconds_per_question INTEGER NOT NULL DEFAULT 40, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX quizzes_owner ON quizzes(owner_id, updated_at DESC);
CREATE TABLE quiz_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profiles(id), quiz_id TEXT REFERENCES quizzes(id) ON DELETE SET NULL, quiz_title TEXT NOT NULL, room_code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE INDEX sessions_owner ON quiz_sessions(owner_id, created_at DESC);
CREATE TABLE quiz_results (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES quiz_sessions(id), round INTEGER NOT NULL, finished_at INTEGER NOT NULL, results_json TEXT NOT NULL, UNIQUE(session_id, round));
CREATE TABLE sign_in_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id), occurred_at INTEGER NOT NULL);
CREATE INDEX signins_user ON sign_in_events(user_id, occurred_at DESC);
