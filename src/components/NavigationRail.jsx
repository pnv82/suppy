import React, { useState } from "react";
import {
  Waves,
  House,
  Path,
  Stack,
  ChatCircleDots,
  UploadSimple,
  Target,
  SignOut,
  UserSwitch,
} from "@phosphor-icons/react";

const destinations = [
  ["Home", House],
  ["Sessions", Path],
  ["Boards", Stack],
  ["Goals", Target],
  ["ChatGPT", ChatCircleDots],
];

export function NavigationRail({ page, onNavigate, onImport, account }) {
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const reveal = () => setLabelsHidden(false);
  return (
    <header
      className={`navigation-rail${labelsHidden ? " labels-hidden" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") setLabelsHidden(true);
      }}
    >
      <button
        className="rail-button rail-brand"
        aria-label={account ? "Suppy account" : "Suppy home"}
        popoverTarget={account ? "account-menu" : undefined}
        aria-expanded={account ? accountOpen : undefined}
        onClick={account ? undefined : () => onNavigate("Home")}
        onFocus={reveal}
        onMouseEnter={reveal}
      >
        <Waves size={27} weight="bold" aria-hidden="true" />
        <span className="rail-label" aria-hidden="true">
          Suppy
        </span>
      </button>
      {account && (
        <div
          id="account-menu"
          className="account-menu"
          popover="auto"
          role="dialog"
          aria-label="Google account"
          onToggle={(event) => setAccountOpen(event.newState === "open")}
        >
          <strong>{account.label}</strong>
          {account.email && account.email !== account.label && (
            <p>{account.email}</p>
          )}
          <button className="button plain" onClick={account.onSwitch}>
            <UserSwitch size={18} /> Switch Google account
          </button>
          <button className="button plain" onClick={account.onLogout}>
            <SignOut size={18} /> Sign out
          </button>
        </div>
      )}
      <nav aria-label="Main navigation">
        {destinations.map(([name, Icon]) => (
          <button
            key={name}
            className="rail-button"
            aria-label={name}
            aria-current={page === name ? "page" : undefined}
            onClick={() => onNavigate(name)}
            onFocus={reveal}
            onMouseEnter={reveal}
          >
            <Icon
              size={22}
              weight={page === name ? "fill" : "regular"}
              aria-hidden="true"
            />
            <span className="rail-label" aria-hidden="true">
              {name}
            </span>
          </button>
        ))}
      </nav>
      <div className="rail-actions">
        <button
          className="rail-button"
          aria-label="Import"
          onClick={onImport}
          disabled={!onImport}
          onFocus={reveal}
          onMouseEnter={reveal}
        >
          <UploadSimple size={22} aria-hidden="true" />
          <span className="rail-label" aria-hidden="true">
            Import
          </span>
        </button>
      </div>
    </header>
  );
}
