-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facebook accounts (max 40 per user enforced in app)
CREATE TABLE IF NOT EXISTS facebook_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_name VARCHAR(255) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  avatar_url TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, account_id)
);

-- Per-account settings
CREATE TABLE IF NOT EXISTS account_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_account_id UUID NOT NULL REFERENCES facebook_accounts(id) ON DELETE CASCADE UNIQUE,
  tone VARCHAR(50) DEFAULT 'professional',
  rules_json TEXT DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments fetched from Facebook
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_account_id UUID NOT NULL REFERENCES facebook_accounts(id) ON DELETE CASCADE,
  comment_id VARCHAR(255) UNIQUE NOT NULL,
  post_id VARCHAR(255),
  text TEXT NOT NULL,
  author_name VARCHAR(255),
  author_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Responses
CREATE TABLE IF NOT EXISTS responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  suggested_text TEXT,
  actual_text TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fb_accounts_user_id ON facebook_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_fb_account ON comments(facebook_account_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_comment ON responses(comment_id);
CREATE INDEX IF NOT EXISTS idx_responses_status ON responses(status);
CREATE INDEX IF NOT EXISTS idx_responses_user ON responses(user_id);
