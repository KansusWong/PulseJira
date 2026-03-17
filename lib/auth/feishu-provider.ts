import type { OAuthConfig } from 'next-auth/providers';

export interface FeishuProfile {
  open_id: string;
  union_id: string;
  name: string;
  avatar_url: string;
  email?: string;
}

export default function FeishuProvider(): OAuthConfig<FeishuProfile> {
  return {
    id: 'feishu',
    name: 'Feishu',
    type: 'oauth',
    clientId: process.env.FEISHU_APP_ID!,
    clientSecret: process.env.FEISHU_APP_SECRET!,
    authorization: {
      url: 'https://open.feishu.cn/open-apis/authen/v1/authorize',
      params: { redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/feishu` },
    },
    token: {
      url: 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
      async request({ params, provider }) {
        const appTokenRes = await fetch(
          'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: provider.clientId,
              app_secret: provider.clientSecret,
            }),
          },
        );
        const { app_access_token } = await appTokenRes.json();

        const tokenRes = await fetch(
          'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${app_access_token}`,
            },
            body: JSON.stringify({
              grant_type: 'authorization_code',
              code: params.code,
            }),
          },
        );
        const data = await tokenRes.json();
        return { tokens: { access_token: data.data.access_token } };
      },
    },
    userinfo: {
      url: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
      async request({ tokens }) {
        const res = await fetch(
          'https://open.feishu.cn/open-apis/authen/v1/user_info',
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        const { data } = await res.json();
        return data;
      },
    },
    profile(profile) {
      return {
        id: profile.open_id,
        name: profile.name,
        email: profile.email || undefined,
        image: profile.avatar_url,
      };
    },
  };
}
