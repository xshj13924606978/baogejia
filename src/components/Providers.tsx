'use client';

import { UserProvider } from '@/contexts/UserContext';
import { SwitchProvider } from '@/components/switch-manager';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <SwitchProvider>{children}</SwitchProvider>
    </UserProvider>
  );
}
