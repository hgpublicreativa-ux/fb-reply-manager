export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface FacebookAccount {
  id: string;
  user_id: string;
  account_name: string;
  account_id: string;
  access_token: string;
  avatar_url: string | null;
  connected_at: Date;
}

export interface AccountSettings {
  id: string;
  facebook_account_id: string;
  tone: string;
  rules_json: string;
  updated_at: Date;
}

export interface Comment {
  id: string;
  facebook_account_id: string;
  comment_id: string;
  post_id: string | null;
  text: string;
  author_name: string | null;
  author_id: string | null;
  created_at: Date;
  fetched_at: Date;
}

export interface Response {
  id: string;
  comment_id: string;
  user_id: string;
  suggested_text: string | null;
  actual_text: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
