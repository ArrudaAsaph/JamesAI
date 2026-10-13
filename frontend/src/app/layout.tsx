import type { Metadata, Viewport } from 'next';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './globals.css';

export const metadata: Metadata = { title: 'Charles — Calendário', description: 'Seu calendário e seus próximos compromissos, em um só lugar.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#04cba0' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
