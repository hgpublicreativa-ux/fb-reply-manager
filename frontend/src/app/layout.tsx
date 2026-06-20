import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FB Reply Manager',
  description: 'Manage Facebook comments with AI-powered responses',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
