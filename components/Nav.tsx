'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, GitBranch, Inbox, Users } from 'lucide-react';

const links = [
  { href: '/', label: 'Accounts', icon: LayoutDashboard },
  { href: '/routing', label: 'Routing', icon: GitBranch },
  { href: '/leads', label: 'Leads', icon: Inbox },
  { href: '/team', label: 'Team', icon: Users },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center h-14 gap-8">
        <span className="text-white font-bold text-sm tracking-wide">
          GTM Signal
        </span>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
