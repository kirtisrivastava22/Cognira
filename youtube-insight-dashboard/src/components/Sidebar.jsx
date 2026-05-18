import React from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/",        icon: "⬡",  label: "Home" },
  { to: "/analyze", icon: "◈",  label: "Analyze" },
  { to: "/history", icon: "◷",  label: "History" },
];

export default function Sidebar({ user, onOpenAuth, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <span className="sidebar-logo-dot" />
          Cognira
        </div>
        <div className="sidebar-tagline">Content intelligence</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

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