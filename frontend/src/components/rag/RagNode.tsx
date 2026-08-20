interface RagNodeProps {
  title: string;
  description?: string;
  highlight?: boolean;
  muted?: boolean;
}

export function RagNode({ title, description, highlight = false, muted = false }: RagNodeProps) {
  return (
    <div className={`rag-node${highlight ? " highlight" : ""}${muted ? " muted" : ""}`}>
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
