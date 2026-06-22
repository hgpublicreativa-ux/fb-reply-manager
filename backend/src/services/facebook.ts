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

export async function getPageInfo(
  pageId: string,
  pageAccessToken: string
): Promise<{ followers: number | null; fanCount: number | null }> {
  try {
    const response = await axios.get(`${FB_BASE}/${pageId}`, {
      params: {
        fields: 'followers_count,fan_count',
        access_token: pageAccessToken,
      },
    });
    return {
      followers: response.data.followers_count ?? null,
      fanCount: response.data.fan_count ?? null,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(
        `getPageInfo error for page ${pageId}:`,
        err.response?.status,
        JSON.stringify(err.response?.data?.error ?? err.message)
      );
    } else {
      console.error(`getPageInfo error for page ${pageId}:`, err);
    }
    return { followers: null, fanCount: null };
  }
}

type FBComment = { id: string; message: string; from?: { name: string; id: string }; created_time: string; post_id?: string; post_message?: string; post_permalink?: string };

export async function getPageComments(
  pageId: string,
  pageAccessToken: string,
  _since?: number
): Promise<FBComment[]> {
  try {
    // Fetch the 50 most recent posts (no `since` filter — a post published days ago
    // can still receive new comments today, so filtering by post age misses them).
    // ON CONFLICT DO NOTHING in the DB handles deduplication efficiently.
    // order(reverse_chronological) → newest comments first. Without it Graph API
    // returns oldest-first, so with a limit the NEW comments fall off the end and
    // never sync on active posts.
    // Use permalink_url, NOT link: the `link` field triggers Graph API error
    // (#12) "deprecate_post_aggregated_fields_for_attachement" on v3.3+, which
    // 400s the ENTIRE feed request — so every page returned 0 comments.
    const feedResponse = await axios.get(`${FB_BASE}/${pageId}/feed`, {
      params: {
        fields: 'id,story,message,permalink_url,comments.order(reverse_chronological).limit(100){id,message,from.fields(name,id),created_time}',
        access_token: pageAccessToken,
        limit: 50,
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
            post_permalink: post.permalink_url,
          });
        }
      }
    }

    return comments;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(
        `getPageComments error for page ${pageId}:`,
        err.response?.status,
        JSON.stringify(err.response?.data?.error ?? err.message)
      );
    } else {
      console.error(`getPageComments error for page ${pageId}:`, err);
    }
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
