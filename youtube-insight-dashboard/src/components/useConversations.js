import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../App";   // re-use the JWT-aware fetch wrapper

export function useConversations(user) {
  const [list,         setList]         = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);

  const userId = user?.user_id ?? null;

  // ── Fetch all conversations for this user ────────────────────────────────
  const fetchList = useCallback(async () => {
    if (!userId) { setList([]); return; }
    try {
      const res = await apiFetch(`/conversations/${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setList(data.conversations || []);
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // ── Reset when user signs out ────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setList([]);
      setActiveConvId(null);
    }
  }, [userId]);

  const select = useCallback((conv) => {
    setActiveConvId(conv?.conv_id ?? null);
  }, []);

  const add = useCallback((conv) => {
    if (!conv) return;
    setActiveConvId(conv.conv_id);
    setList(prev => {
      const exists = prev.find(c => c.conv_id === conv.conv_id);
      return exists ? prev : [conv, ...prev];
    });
  }, []);

  const update = useCallback((conv) => {
    if (!conv) return;
    setList(prev =>
      prev.map(c => c.conv_id === conv.conv_id ? { ...c, ...conv } : c)
    );
  }, []);

  const remove = useCallback((conv_id) => {
    setList(prev => prev.filter(c => c.conv_id !== conv_id));
    setActiveConvId(prev => (prev === conv_id ? null : prev));
  }, []);

  return { list, activeConvId, select, add, update, remove, refresh: fetchList };
}