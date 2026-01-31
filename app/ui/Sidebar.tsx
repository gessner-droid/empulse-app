"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Users, ClipboardList, Video } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Swipe (Mobile)
  const startX = useRef<number | null>(null);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      startX.current = e.touches[0]?.clientX ?? null;
    }
    function onTouchEnd(e: TouchEvent) {
      if (startX.current === null) return;
      const endX = e.changedTouches[0]?.clientX ?? startX.current;
      const dx = endX - startX.current;

      if (!open && dx > 60) setOpen(true);
      if (open && dx < -60) setOpen(false);

      startX.current = null;
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [open]);

  const width = open ? 270 : 86;

  return (
    <aside
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="sidebar"
      style={{ width, display: "flex", flexDirection: "column" }}
    >
      {/* Logo */}
      <div className="sidebar-top">
        <Link href="/dashboard" className="sidebar-logoLink">
          <div className="sidebar-logo" style={{ width: open ? 210 : 52 }}>
            <Image
              src="/logo.png"
              alt="empulse PRO+"
              fill
              priority
              style={{ objectFit: "contain" }}
            />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="nav">
        <NavItem
          href="/dashboard"
          label="Dashboard"
          open={open}
          active={pathname === "/dashboard"}
          icon={<LayoutDashboard size={18} />}
        />
        <NavItem
          href="/clients"
          label="Kunden"
          open={open}
          active={pathname.startsWith("/clients")}
          icon={<Users size={18} />}
        />
        <NavItem
          href="/sessions"
          label="Sessions"
          open={open}
          active={pathname.startsWith("/sessions")}
          icon={<ClipboardList size={18} />}
        />
        <NavItem
          href="/webinars"
          label="Webinare"
          open={open}
          active={pathname.startsWith("/webinars")}
          icon={<Video size={18} />}
        />
      </nav>

      {/* Footer (Logout) */}
    <div className="sidebar-foot sidebar-foot--logout">
  {open && (
    <button
      onClick={signOut}
      className="sidebar-logout sidebar-logout--danger"
    >
      <span className="sidebar-logout-text">Ausloggen</span>
      <span className="sidebar-logout-iconEnd">⎋</span>
    </button>
  )}

  {!open && <span className="sidebar-miniMark">↗</span>}
</div>


    </aside>
  );
}

function NavItem({
  href,
  icon,
  label,
  open,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  open: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`nav-item ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="nav-icon">{icon}</span>
      {open && <span className="nav-label">{label}</span>}
    </Link>
  );
}
