export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface FacebookAccount {
  id: string;
  account_name: string;
  account_id: string;
  avatar_url: string | null;
  connected_at: string;
}

export interface AccountSettings {
  tone: string;
  rules: string[];
}

export interface Comment {
  id: string;
  comment_id: string;
  post_id: string | null;
  text: string;
  author_name: string | null;
  author_id: string | null;
  created_at: string;
  response_id: string | null;
  suggested_text: string | null;
  actual_text: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'published' | null;
}

export interface AccountStats {
  totalComments: number;
  responded: number;
  pending: number;
}

export type FilterType = 'all' | 'pending' | 'responded';
