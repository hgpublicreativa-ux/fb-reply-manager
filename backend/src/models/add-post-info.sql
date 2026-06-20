-- Add post information to comments table
ALTER TABLE comments 
  ADD COLUMN IF NOT EXISTS post_message TEXT,
  ADD COLUMN IF NOT EXISTS post_permalink TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
