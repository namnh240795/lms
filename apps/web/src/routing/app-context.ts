import { useOutletContext } from 'react-router-dom';
import type { authClient, Course } from '@/lib/api';
import type { useMarketplace, useMarketplaceActions } from '@/hooks/use-marketplace';
type Session = ReturnType<typeof authClient.useSession>['data'];
export type AppContext = {
  session: Session;
  isPending: boolean;
  userId: string;
  role: string;
  data: ReturnType<typeof useMarketplace>;
  actions: ReturnType<typeof useMarketplaceActions>;
  busy: boolean;
  teach: () => void;
  openCourse: (course: Course, lessonId?: string) => void;
  notify: (message: string) => void;
  report: (message: string) => void;
};
export const useApp = () => useOutletContext<AppContext>();
