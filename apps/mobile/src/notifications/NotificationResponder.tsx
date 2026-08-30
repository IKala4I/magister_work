/**
 * Renders nothing; listens for notification responses (warm) and picks up the response that
 * launched the app (cold) — both go through handleNotificationResponse exactly once.
 */
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { appResponseDeps, handleNotificationResponse, type Route } from './respond';

export function NotificationResponder() {
  const router = useRouter();
  const deps = useMemo(() => appResponseDeps((route: Route) => router.navigate(route)), [router]);
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (last) handleNotificationResponse(last, deps);
  }, [last, deps]);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response, deps);
    });
    return () => sub.remove();
  }, [deps]);
  return null;
}
