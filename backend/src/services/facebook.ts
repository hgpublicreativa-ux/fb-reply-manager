import axios from 'axios';

const FB_BASE = 'https://graph.facebook.com/v21.0';

export function getFacebookAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: `${process.env.BACKEND_URL}/api/auth/facebook/callback`,
    scope: 'email,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,pages_read_user_content,pages_manage_metadata',
    response_type: 'code',
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await axios.get(`${FB_BASE}/oauth/access_token`, {
    params: {
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      redirect_uri: `${process.env.BACKEND_URL}/api/auth/facebook/callback`,
      code,
    },
  });
  return response.data.access_token;
}

export async function getMe(accessToken: string): Promise<{ id: string; name: string; picture?: { data: { url: string } } }> {
  const response = await axios.get(`${FB_BASE}/me`, {
    params: {
      fields: 'id,name,picture',
      access_token: accessToken,
    },
  });
  return response.data;
}

export async function getPages(accessToken: string): Promise<Array<{ id: string; name: string; picture?: { data: { url: string } }; access_token: string }>> {
  const response = await axios.get(`${FB_BASE}/me/accounts`, {
    params: {
      fields: 'id,name,picture,access_token',
      access_token: accessToken,
    },
  });
  return response.data.data || [];
}

export async function getPageComments(
  pageId: string,
  pageAccessToken: string,
  since?: number
): Promise<Array<{ id: string; message: string; from?: { name: string; id: string }; created_time: string; post_id?: string }>> {
  const params: Record<string, string | number> = {
    fields: 'id,message,from,created_time,post_id',
    access_token: pageAccessToken,
    limit: 100,
  };

  if (since) params.since = since;

  try {
    const feedResponse = await axios.get(`${FB_BASE}/${pageId}/feed`, {
      params: {
        fields: 'id,comments{id,message,from,created_time}',
        access_token: pageAccessToken,
        limit: 25,
      },
    });

    const comments: Array<{ id: string; message: string; from?: { name: string; id: string }; created_time: string; post_id?: string }> = [];

    for (const post of feedResponse.data.data || []) {
      if (post.comments?.data) {
        for (const comment of post.comments.data) {
          comments.push({ ...comment, post_id: post.id });
        }
      }
    }

    return comments;
  } catch {
    return [];
  }
}

export async function publishComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<{ id: string }> {
  const response = await axios.post(`${FB_BASE}/${commentId}/comments`, null, {
    params: {
      message,
      access_token: accessToken,
    },
  });
  return response.data;
}
