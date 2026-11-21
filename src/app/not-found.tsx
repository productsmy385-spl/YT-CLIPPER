import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h2 className="text-xl font-extrabold text-foreground">Page Not Found</h2>
      <p className="text-xs text-muted-foreground max-w-sm">
        The requested studio route does not exist or has been relocated.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-[#194350] font-bold text-xs shadow-sm hover:opacity-95"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Return to Dashboard
      </Link>
    </div>
  );
}
