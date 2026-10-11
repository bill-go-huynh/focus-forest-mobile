import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { readApiBaseUrl, roomSchema, useApi } from '../api';
import { roomKeys } from './queries';

/**
 * The live room channel (A5.4 `/rooms/live`, docs/07 §6): state only. The access token goes in the
 * first message, never in the URL. Each `room` message replaces the cached room, as `GET /rooms/:id`
 * would answer it; `gone` reads the room again. REST stays the authority: without the channel the
 * room is read again on its own interval.
 */
export function useRoomLive(roomId: string): void {
  const { session } = useApi();
  const queryClient = useQueryClient();

  useEffect(() => {
    const Socket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!Socket) return undefined;
    let url: string;
    try {
      url = `${readApiBaseUrl().replace(/^http/, 'ws')}/rooms/live`;
    } catch {
      return undefined;
    }
    const socket = new Socket(url);
    let closed = false;
    socket.onopen = () => {
      const token = session.getAccessToken();
      if (!token || closed) return;
      socket.send(JSON.stringify({ type: 'auth', token }));
      socket.send(JSON.stringify({ type: 'watch', roomId }));
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
      if (type === 'room') {
        const room = roomSchema.safeParse((message as { room?: unknown }).room);
        if (room.success && room.data.id === roomId) {
          queryClient.setQueryData(roomKeys.room(roomId), room.data);
        }
      } else if (type === 'gone') {
        void queryClient
          .invalidateQueries({ queryKey: roomKeys.room(roomId) })
          .catch(() => undefined);
      }
    };
    return () => {
      closed = true;
      socket.close();
    };
  }, [roomId, session, queryClient]);
}
