import type { OAuthConfig } from 'next-auth/providers';

export interface WeComProfile {
  userid: string;
  name: string;
  email?: string;
  avatar?: string;
}

export default function WeComProvider(): OAuthConfig<WeComProfile> {
  return {
    id: 'wecom',
    name: 'WeCom',
    type: 'oauth',
    clientId: process.env.WECOM_CORP_ID!,
    clientSecret: process.env.WECOM_APP_SECRET!,
    authorization: {
      url: 'https://open.work.weixin.qq.com/wwopen/sso/qrConnect',
      params: {
        appid: process.env.WECOM_CORP_ID,
        agentid: process.env.WECOM_AGENT_ID,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/wecom`,
      },
    },
    token: {
      url: 'https://qyapi.weixin.qq.com/cgi-bin/gettoken',
      async request({ params, provider }: { params: any; provider: any }) {
        const tokenRes = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${provider.clientId}&corpsecret=${provider.clientSecret}`,
        );
        const { access_token } = await tokenRes.json();

        const userRes = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${access_token}&code=${params.code}`,
        );
        const userData = await userRes.json();

        return {
          tokens: {
            access_token,
            userId: userData.userid || userData.UserId,
          },
        };
      },
    },
    userinfo: {
      async request({ tokens }: { tokens: any }) {
        const res = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${tokens.access_token}&userid=${(tokens as any).userId}`,
        );
        return res.json();
      },
    },
    profile(profile) {
      return {
        id: profile.userid,
        name: profile.name,
        email: profile.email || undefined,
        image: profile.avatar || undefined,
      };
    },
  };
}
