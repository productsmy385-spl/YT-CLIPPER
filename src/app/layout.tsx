import type { Metadata } from 'next';
import './globals.css';
import { ClientShell } from '@/components/layout/client-shell';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'GTA 6 AI Shorts & Reels Studio | Autonomous Multi-Agent Editing',
  description: 'AI-Powered gaming video editing suite turning long gameplay into viral 9:16 vertical YouTube Shorts & Instagram Reels.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const urlParams = new URLSearchParams(window.location.search);
                const themeParam = urlParams.get('theme');
                const saved = localStorage.getItem('gta6_shorts_theme');
                const isDark = themeParam === 'dark' || (!themeParam && saved === 'dark');
                if (isDark) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <ClientShell>{children}</ClientShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
