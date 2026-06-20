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

type FBComment = { id: string; message: string; from?: { name: string; id: string }; created_time: string; post_id?: string; post_message?: string; post_permalink?: string };

export async function getPageComments(
  pageId: string,
  pageAccessToken: string,
  since?: number
): Promise<FBComment[]> {
  try {
    // Default: last 24 hours if no since timestamp given
    const sinceTs = since ?? Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    const feedResponse = await axios.get(`${FB_BASE}/${pageId}/feed`, {
      params: {
        // comments.limit(100) gets up to 100 comments per post (FB default is 25)
        fields: 'id,story,message,link,comments.limit(100){id,message,from.fields(name,id),created_time}',
        access_token: pageAccessToken,
        limit: 50,
        since: sinceTs,
      },
    });

    const comments: FBComment[] = [];

    for (const post of feedResponse.data.data || []) {
      if (post.comments?.data) {
        for (const comment of post.comments.data) {
          comments.push({
            ...comment,
            post_id: post.id,
            post_message: post.story || post.message,
            post_permalink: post.link,
          });
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
