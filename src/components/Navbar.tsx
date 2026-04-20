
import { Link } from "react-router-dom";
import { CalendarDays, Github } from "lucide-react";

export default function Navbar() {
  return (
    <div className="w-full">
      <div className="max-w-7xl mx-auto px-4">
        <nav className="w-full flex justify-between items-center py-6">
          <Link to="/" className="flex items-center gap-3">
            <CalendarDays className="text-primary w-8 h-8" />
            <span className="text-xl font-extrabold tracking-tight text-white">
              UtahDev.events
            </span>
          </Link>
          <div className="flex items-center gap-5">
            <Link
              to="/past"
              className="text-sm text-muted-foreground hover:text-white story-link"
            >
              Past events
            </Link>
            <a
              href="https://github.com/forgeutah"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-white story-link"
              aria-label="Forge Utah Foundation Github"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </nav>
      </div>
    </div>
  );
}
