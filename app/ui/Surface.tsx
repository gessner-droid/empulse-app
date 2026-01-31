"use client";
import type { ReactNode } from "react";

export default function Surface({
  children,
  className = "",
}: { children: ReactNode; className?: string }) {
  return (
    <section className={`surface pad ${className}`.trim()}>
      {children}
    </section>
  );
}