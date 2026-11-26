import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Poppins } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Scrollbound — Personal Novel Reader',
  description:
    'A personal, single-user novel reader. Extract PDFs and read clean reflowable text with offline storage, custom themes, and position resumption.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

import { AuthProvider } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import { SyncFailureModal } from '@/components/SyncFailureModal';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Anti-flash theme initialization script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('scrollbound_reader_settings');
                  var themeId = 'light';
                  if (stored) {
                    var parsed = JSON.parse(stored);
                    if (parsed.themeId) themeId = parsed.themeId;
                  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    themeId = 'dark';
                  }
                  var themes = {
                    light: { bg: '#fbfbfb', text: '#1e293b', accent: '#2563eb' },
                    dark: { bg: '#121214', text: '#e2e8f0', accent: '#60a5fa' },
                    sepia: { bg: '#fbf0d9', text: '#433422', accent: '#b45309' }
                  };
                  var theme = themes[themeId] || themes.light;
                  document.documentElement.style.setProperty('--sb-bg', theme.bg);
                  document.documentElement.style.setProperty('--sb-text', theme.text);
                  document.documentElement.style.setProperty('--sb-accent', theme.accent);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
          <AuthModal />
          <SyncFailureModal />
        </AuthProvider>
      </body>
    </html>
  );
}
