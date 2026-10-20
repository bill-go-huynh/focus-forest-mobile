import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { readApiBaseUrl, submittedSessionSchema, useApi, useSession } from '../api';
import { useCelebrationStore } from '../celebrations/CelebrationsProvider';
import { serverConfirmations } from '../core-loop/confirmations';
import { useCompletionReceipts } from '../sessions/CompletionReceiptsProvider';
import { useAppActive } from '../tree/use-app-active';

/** Demo accounts only (the API's demo tools make them): a real account never connects. */
const DEMO_EMAIL = /^demo\d+(?:-[a-z-]+)?@focusforest\.test$/;

/**
 * DM.3 The demo live channel (`/demo/live`, spec/demo): while a demo account's app is open, what
 * an admin changes on the Demo page shows at once. Demo tooling, not product (docs/07 keeps
 * realtime to rooms). A `session` is a session the admin added, exactly as `PUT /me/sessions/:id`
 * answers it: it is kept to celebrate and as a receipt, as if this phone had sent it. `refresh`
 * reads everything again. The token goes in the first message, never the URL.
 */
export function useDemoLive(): void {
  const { session } = useApi();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const celebrations = useCelebrationStore();
  const receipts = useCompletionReceipts();
  const active = useAppActive();
  const userId = user && DEMO_EMAIL.test(user.email) ? user.id : null;

  useEffect(() => {
    if (!userId || !active) return undefined;
    const Socket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!Socket) return undefined;
    let url: string;
    try {
      url = `${readApiBaseUrl().replace(/^http/, 'ws')}/demo/live`;
    } catch {
      return undefined;
    }
    const socket = new Socket(url);
    let closed = false;
    const readAgain = () => void queryClient.invalidateQueries().catch(() => undefined);
    socket.onopen = () => {
      const token = session.getAccessToken();
      if (!token || closed) return;
      socket.send(JSON.stringify({ type: 'auth', token }));
    };
    socket.onmessage = (event: { data: unknown }) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof message !== 'object' || message === null) return;
      const { type } = message as { type?: unknown };
      if (type === 'session') {
        const parsed = submittedSessionSchema.safeParse((message as { session?: unknown }).session);
        if (!parsed.success) return;
        serverConfirmations.advance();
        void (async () => {
          await celebrations.record(userId, parsed.data);
          await receipts.keep(userId, parsed.data);
          readAgain();
        })().catch(() => undefined);
      } else if (type === 'refresh') {
        readAgain();
      }
    };
    return () => {
      closed = true;
      socket.close();
    };
  }, [userId, active, session, queryClient, celebrations, receipts]);
}

/** Mounted once, inside the signed-in app. */
export function DemoLive(): null {
  useDemoLive();
  return null;
}
