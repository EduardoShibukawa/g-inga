CREATE TABLE session_v2 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  directory TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  time_created INTEGER NOT NULL
);
CREATE TABLE session_message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  time_created INTEGER NOT NULL,
  data TEXT NOT NULL
);
INSERT INTO session_v2(id, project_id, directory, cost, tokens_input, tokens_output, time_created) VALUES
  ('ses-paid-1', 'p1', '/workspace/a', 0.25, 100, 20, 1700000000000),
  ('ses-paid-2', 'p1', '/workspace/b', 0.75, 200, 40, 1700000100000),
  ('ses-free', 'p1', '/workspace/c', 0, 50, 10, 1700000200000);
INSERT INTO session_message(id, session_id, seq, time_created, data) VALUES
  ('m1', 'ses-paid-1', 1, 1700000000000, '{"model":{"id":"glm-5.3-flash","providerID":"opencode"}}'),
  ('m2', 'ses-paid-2', 1, 1700000100000, '{"model":{"id":"deepseek-v4.1-flash","providerID":"opencode"}}'),
  ('m3', 'ses-free', 1, 1700000200000, '{"model":{"id":"qwen3.8-flash","providerID":"opencode"}}');
