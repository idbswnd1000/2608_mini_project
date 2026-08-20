import { NavigationAction, PageId, navigationGroups } from "../../navigation/navigation";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (action: NavigationAction) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="RAG class navigation">
      {navigationGroups.map((group) => (
        <nav className="sidebar-group" key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map((item) => (
            <button
              className={activePage === item.id ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() =>
                onNavigate({
                  type: "NAVIGATE",
                  page: item.id,
                  source: "manual",
                  runPresentation: false
                })
              }
            >
              {item.label}
            </button>
          ))}
        </nav>
      ))}
    </aside>
  );
}
