export type PageId =
  | "basic"
  | "naive"
  | "advanced"
  | "agentic"
  | "comparison"
  | "ragComparison"
  | "graphrag"
  | "multimodal";

export type NavigationSource = "manual" | "voice" | "keyboard";

export interface NavigationItem {
  id: PageId;
  label: string;
}

export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

export interface NavigationAction {
  type: "NAVIGATE";
  page: PageId;
  source: NavigationSource;
  runPresentation: boolean;
}

export const navigationGroups: NavigationGroup[] = [
  {
    title: "강의",
    items: [
      { id: "basic", label: "RAG 기본" },
      { id: "naive", label: "Naive RAG" },
      { id: "advanced", label: "Advanced RAG" },
      { id: "agentic", label: "Agentic RAG" },
      { id: "ragComparison", label: "RAG 비교" },
      { id: "comparison", label: "구조 비교" }
    ]
  },
  {
    title: "확장 RAG",
    items: [
      { id: "multimodal", label: "Multimodal RAG" },
      { id: "graphrag", label: "Agentic + Multimodal" }
    ]
  }
];

export const orderedPages = navigationGroups.flatMap((group) => group.items.map((item) => item.id));
