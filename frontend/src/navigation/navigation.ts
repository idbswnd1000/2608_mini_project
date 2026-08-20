export type PageId =
  | "basic"
  | "naive"
  | "advanced"
  | "agentic"
  | "comparison"
  | "playground"
  | "evaluation"
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
      { id: "comparison", label: "구조 비교" }
    ]
  },
  {
    title: "실습",
    items: [{ id: "playground", label: "RAG Playground" }]
  },
  {
    title: "평가",
    items: [{ id: "evaluation", label: "성능 비교" }]
  },
  {
    title: "확장 RAG",
    items: [
      { id: "graphrag", label: "GraphRAG" },
      { id: "multimodal", label: "Multimodal RAG" }
    ]
  }
];

export const orderedPages = navigationGroups.flatMap((group) => group.items.map((item) => item.id));
