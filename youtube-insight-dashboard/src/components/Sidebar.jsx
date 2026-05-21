import React, { useState, useEffect, useRef, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
const API = process.env.REACT_APP_API_URL;

const NAV = [
  { to: "/", icon: "⬡", label: "Home" },
  { to: "/analyze", icon: "◈", label: "Analyze" },
  { to: "/history", icon: "◷", label: "History" },
];

// ── Conversation list item ────────────────────────────────────────────────
const ConvItem = React.memo(function ConvItem({
  conv, isActive, isRenaming, renameValue, renameRef,
  menuOpen, menuRef,
  onSelect, onMenuToggle, onRenameChange, onRenameCommit,
  onRenameStart, onDelete, onPin,
}) {
  return (
    <div
      className={`overflow: visible zIndex: 9999 position: relative sidebar-conv-item${isActive ? " active" : ""}`}
      onClick={isRenaming ? undefined : onSelect}
      title={conv.title}
    >
      {conv.pinned && <span className="conv-pin-dot">📌</span>}

      {isRenaming ? (
        <input
          ref={renameRef}
          className="conv-rename-input"
          value={renameValue}
          onChange={e => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={e => {
            if (e.key === "Enter") onRenameCommit();
            if (e.key === "Escape") {
              e.stopPropagation();
              onRenameCommit(); // cancel gracefully
            }
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="conv-title">{conv.title || "Untitled"}</span>
      )}

      <button
        className="conv-menu-btn"
        onClick={(e) => {
          e.stopPropagation();
          onMenuToggle(e);
        }}
      >
        ···
      </button>

      {menuOpen && (
        <div
          className="conv-context-menu"
          ref={menuRef}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onRenameStart}>Rename</button>
          <button onClick={onPin}>{conv.pinned ? "Unpin" : "Pin"}</button>
          <button className="danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  );
});

// ── Group conversations ───────────────────────────────────────────────────
function groupConvsByDate(convs) {
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayMs = todayMs - 86400000;
  const weekMs = todayMs - 7 * 86400000;

  const groups = { Pinned: [], Today: [], Yesterday: [], "This week": [], Older: [] };

  for (const c of convs) {
    if (c.pinned) {
      groups.Pinned.push(c);
      continue;
    }

    const t = new Date(c.updated_at || c.created_at || 0).getTime();

    if (t >= todayMs) groups.Today.push(c);
    else if (t >= yesterdayMs) groups.Yesterday.push(c);
    else if (t >= weekMs) groups["This week"].push(c);
    else groups.Older.push(c);
  }

  return groups;
}

// ── Sidebar ───────────────────────────────────────────────────────────────
export default function Sidebar({
  user,
  onOpenAuth,
  onSignOut,
  activeConvId,
  conversations = [],
  onSelectConv,
  onConvRenamed,
  onConvDeleted,
  onConvPinned,
}) {
  const navigate = useNavigate();

  const [convList, setConvList] = useState(conversations);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const renameRef = useRef(null);
  const menuRefs = useRef({}); // 🔥 FIXED multi-ref

  // sync with parent
  useEffect(() => setConvList(conversations), [conversations]);

  // outside click (fixed)
  useEffect(() => {
    const handler = (e) => {
      const currentMenu = menuRefs.current[menuOpen];
      if (currentMenu && !currentMenu.contains(e.target)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // focus rename
  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  // ── Rename ──────────────────────────────────────────────────────────────
  const startRename = (conv) => {
    setMenuOpen(null);
    setRenaming(conv.conv_id);
    setRenameValue(conv.title);
  };

  const commitRename = async (conv_id) => {
    const title = renameValue.trim();
    setRenaming(null);
    if (!title) return;

    try {
      const res = await fetch(`${API}/conversations/${conv_id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (res.ok) {
        const updated = await res.json();
        setConvList(prev =>
          prev.map(c => c.conv_id === conv_id ? updated : c)
        );
        onConvRenamed?.(updated);
      }
    } catch {}
  };

  // ── Delete (optimistic) ─────────────────────────────────────────────────
  const handleDelete = async (conv_id) => {
    setMenuOpen(null);
    if (!window.confirm("Delete this conversation?")) return;

    const prev = convList;
    setConvList(prev => prev.filter(c => c.conv_id !== conv_id));

    try {
      const res = await fetch(`${API}/conversations/${conv_id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error();

      onConvDeleted?.(conv_id);

      if (activeConvId === conv_id) navigate("/");

    } catch {
      setConvList(prev); // rollback
    }
  };

  // ── Pin ─────────────────────────────────────────────────────────────────
  const handlePin = async (conv) => {
    setMenuOpen(null);

    try {
      const res = await fetch(`${API}/conversations/${conv.conv_id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !conv.pinned }),
      });

      if (res.ok) {
        const updated = await res.json();

        setConvList(prev =>
          prev
            .map(c => c.conv_id === conv.conv_id ? updated : c)
            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
        );

        onConvPinned?.(updated);
      }
    } catch {}
  };

  // 🔥 memoized grouping (performance)
  const grouped = useMemo(() => groupConvsByDate(convList), [convList]);

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>

      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <span className="sidebar-logo-dot" />
          {!collapsed && "Cognira"}
        </div>

        {!collapsed && <div className="sidebar-tagline">Content intelligence</div>}

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setCollapsed(c => !c)}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <span className="nav-icon">{icon}</span>
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Conversations */}
      {!collapsed && convList.length > 0 && (
        <div className="sidebar-conv-section">
          <div className="sidebar-conv-heading">Conversations</div>

          {Object.entries(grouped).map(([group, convs]) =>
            convs.length === 0 ? null : (
              <div key={group}>
                <div className="sidebar-conv-group-label">{group}</div>

                {convs.map(conv => (
                  <ConvItem
                    key={conv.conv_id}
                    conv={conv}
                    isActive={conv.conv_id === activeConvId}
                    isRenaming={renaming === conv.conv_id}
                    renameValue={renameValue}
                    renameRef={renameRef}
                    menuOpen={menuOpen === conv.conv_id}
                    menuRef={el => (menuRefs.current[conv.conv_id] = el)}
                    onSelect={() => {
                      onSelectConv?.(conv);
                      navigate("/analyze");
                    }}
                    onMenuToggle={() =>
                      setMenuOpen(menuOpen === conv.conv_id ? null : conv.conv_id)
                    }
                    onRenameChange={setRenameValue}
                    onRenameCommit={() => commitRename(conv.conv_id)}
                    onRenameStart={() => startRename(conv)}
                    onDelete={() => handleDelete(conv.conv_id)}
                    onPin={() => handlePin(conv)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        {user ? (
          <>
            <div className="sidebar-user">
              <div className="user-avatar">
                {user.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-email">{user.email}</div>
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={onSignOut}
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={onOpenAuth}
          >
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}