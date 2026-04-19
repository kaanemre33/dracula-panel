import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';

function collectPresenceUsers(channel) {
  const presenceState = channel.presenceState();
  const latestUsers = new Map();

  Object.values(presenceState).forEach((entries = []) => {
    entries.forEach((entry) => {
      const identity = entry.userId || entry.username || entry.sessionId;
      if (!identity) return;
      const previous = latestUsers.get(identity);
      if (!previous || String(entry.lastSeenAt || '') >= String(previous.lastSeenAt || '')) {
        latestUsers.set(identity, entry);
      }
    });
  });

  return Array.from(latestUsers.values()).sort((left, right) =>
    String(left.displayName || '').localeCompare(String(right.displayName || ''), 'tr')
  );
}

export function useOnlineUsers(currentUser, pageLabel) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const sessionId = useMemo(
    () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    []
  );

  useEffect(() => {
    if (!currentUser) {
      setOnlineUsers([]);
      return undefined;
    }

    const trackPayload = {
      sessionId,
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      role: currentUser.role,
      pageLabel,
      lastSeenAt: new Date().toISOString(),
    };

    const channel = supabase.channel('panel-online-users', {
      config: {
        presence: {
          key: `${currentUser.id || currentUser.username}-${sessionId}`,
        },
      },
    });

    const syncUsers = () => {
      setOnlineUsers(collectPresenceUsers(channel));
    };

    channel.on('presence', { event: 'sync' }, syncUsers);
    channel.on('presence', { event: 'join' }, syncUsers);
    channel.on('presence', { event: 'leave' }, syncUsers);

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await channel.track(trackPayload);
      syncUsers();
    });

    const heartbeat = window.setInterval(() => {
      channel.track({
        ...trackPayload,
        pageLabel,
        lastSeenAt: new Date().toISOString(),
      });
    }, 20000);

    return () => {
      window.clearInterval(heartbeat);
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.username, currentUser?.displayName, currentUser?.role, pageLabel, sessionId]);

  return onlineUsers;
}
