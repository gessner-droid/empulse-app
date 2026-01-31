"use client";

import type { ReactNode } from "react";

export default function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 22,
        }}
      >
        <div>
          <h1 style={{ fontSize: 36, margin: 0 }}>{title}</h1>
          {subtitle ? (
            <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.85 }}>
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {actions}
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}