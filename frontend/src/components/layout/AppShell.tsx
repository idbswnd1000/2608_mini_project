import { ReactNode } from "react";
import { NavigationAction, PageId } from "../../navigation/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  activePage: PageId;
  onNavigate: (action: NavigationAction) => void;
  children: ReactNode;
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-layout">
      <Header />
      <div className="app-body">
        <Sidebar activePage={activePage} onNavigate={onNavigate} />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
