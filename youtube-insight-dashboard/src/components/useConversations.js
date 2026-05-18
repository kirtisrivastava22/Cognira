import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function useConversations(user, mediaId) {
  const [list,         setList]         = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);

  // ── Fetch conversations for this user (+ optional media filter) ──────────
  const fetchList = useCallback(async () => {
    if (!user?.user_id) { setList([]); return; }
    try {
      const url = mediaId
        ? `${API}/conversations/${user.user_id}?media_id=${mediaId}`
        : `${API}/conversations/${user.user_id}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setList(data.conversations || []);
    } catch { /* ignore */ }
  }, [user, mediaId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ── Select a conversation from the sidebar ───────────────────────────────
  const select = useCallback((conv) => {
    setActiveConvId(conv.conv_id);
  }, []);

  // ── Add a newly-created conversation ────────────────────────────────────
  const add = useCallback((conv) => {
    if (!conv) return;
    setActiveConvId(conv.conv_id);
    setList(prev => {
      const exists = prev.find(c => c.conv_id === conv.conv_id);
      return exists ? prev : [conv, ...prev];
    });
  }, []);

  // ── Update an existing conversation (rename / pin / append) ─────────────
  const update = useCallback((conv) => {
    if (!conv) return;
    setList(prev => prev.map(c => c.conv_id === conv.conv_id ? conv : c));
  }, []);

  // ── Remove a deleted conversation ────────────────────────────────────────
  const remove = useCallback((conv_id) => {
    setList(prev => prev.filter(c => c.conv_id !== conv_id));
    setActiveConvId(prev => (prev === conv_id ? null : prev));
  }, []);

  return { list, activeConvId, select, add, update, remove, refresh: fetchList };
}
