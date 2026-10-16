import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
export function NavigationGuard({ dirty, message }: { dirty: boolean; message: string }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(message)) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, message]);
  return null;
}
