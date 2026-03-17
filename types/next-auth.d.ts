import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    id: string;
  }
  interface Session {
    user: {
      userId: string;
      currentOrgId: string | null;
      orgRole: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    currentOrgId?: string;
    orgRole?: string;
  }
}
