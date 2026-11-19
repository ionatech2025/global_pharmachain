"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";

export interface RoleTab {
  label: string;
  icon: ReactNode;
  /** Server-rendered panel; every panel is in the HTML, the inactive ones hidden. */
  panel: ReactNode;
}

/** WAI-ARIA tabs (automatic activation): roving tabindex, arrows/Home/End move and select. */
export function RoleTabs({ label, tabs }: { label: string; tabs: RoleTab[] }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    setActive(index);
    buttons.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = tabs.length - 1;
    const target = {
      ArrowRight: active === last ? 0 : active + 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="mx-auto flex w-fit flex-wrap justify-center gap-2"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border/70 bg-card px-4 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground [&_svg]:size-4"
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: APG tabs pattern — a panel without its own focusable content takes focus
          tabIndex={0}
          className="mt-8 rounded-2xl outline-offset-4"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
