import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Providers from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'GTM Signal Scoring',
  description: 'Inbound lead routing powered by real enrichment signals',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-gray-50 min-h-screen">
        <Nav />
        <Providers>
          <main className="max-w-screen-xl mx-auto px-4 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
