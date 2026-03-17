import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { supabase } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import FeishuProvider from '@/lib/auth/feishu-provider';
import WeComProvider from '@/lib/auth/wecom-provider';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { data: user } = await supabase
          .from('users')
          .select('id, email, name, password_hash, avatar_url')
          .eq('email', credentials.email as string)
          .single();

        if (!user || !user.password_hash) return null;

        const valid = await verifyPassword(
          credentials.password as string,
          user.password_hash,
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
        };
      },
    }),
    ...(process.env.FEISHU_APP_ID ? [FeishuProvider()] : []),
    ...(process.env.WECOM_CORP_ID ? [WeComProvider()] : []),
  ],
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider && account.provider !== 'credentials') {
        const { supabase } = await import('@/lib/db/client');

        const { data: existing } = await supabase
          .from('auth_accounts')
          .select('user_id')
          .eq('provider', account.provider)
          .eq('provider_account_id', account.providerAccountId!)
          .single();

        if (existing) {
          await supabase.from('auth_accounts')
            .update({
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at
                ? new Date(account.expires_at * 1000).toISOString()
                : null,
            })
            .eq('provider', account.provider)
            .eq('provider_account_id', account.providerAccountId!);
          user.id = existing.user_id;
        } else {
          const { getUserByEmail, createUser } = await import('@/lib/services/user-service');
          let dbUser = user.email ? await getUserByEmail(user.email) : null;
          if (!dbUser) {
            dbUser = await createUser(user.email || `${account.provider}-${account.providerAccountId}`, user.name || 'SSO User');
          }
          await supabase.from('auth_accounts').insert({
            user_id: dbUser.id,
            provider: account.provider,
            provider_account_id: account.providerAccountId!,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
          });
          user.id = dbUser.id;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }

      // Resolve default org if not set
      if (token.userId && !token.currentOrgId) {
        const { data: memberships } = await supabase
          .from('org_members')
          .select('org_id, role')
          .eq('user_id', token.userId as string);

        if (memberships && memberships.length > 0) {
          token.currentOrgId = memberships[0].org_id;
          token.orgRole = memberships[0].role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.userId = token.userId as string;
        session.user.currentOrgId = (token.currentOrgId as string) || null;
        session.user.orgRole = (token.orgRole as string) || null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
