"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Users, ClipboardList, Video, Menu, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open, isMobile]);

  const width = isMobile ? 260 : open ? 270 : 86;

  return (
    <>
      <div className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={open}
          aria-controls="mobile-sidebar"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link href="/dashboard" className="mobile-topbar__brand" aria-label="Empulse">
          <span className="mobile-topbar__logo">
            <Image
              src="/logo.png"
              alt="empulse PRO+"
              fill
              priority
              sizes="120px"
              style={{ objectFit: "contain" }}
            />
          </span>
        </Link>
        <span className="mobile-topbar__spacer" />
      </div>

      {isMobile && open && <div className="mobile-overlay" onClick={() => setOpen(false)} />}

      <aside
        id="mobile-sidebar"
        onMouseEnter={isMobile ? undefined : () => setOpen(true)}
        onMouseLeave={isMobile ? undefined : () => setOpen(false)}
        className={`sidebar ${open ? "open" : ""}`}
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
    </>
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
