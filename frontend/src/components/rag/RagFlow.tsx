import { RagNode } from "./RagNode";

export interface FlowNode {
  id: string;
  title: string;
  description?: string;
  highlight?: boolean;
  muted?: boolean;
}

interface RagFlowProps {
  nodes: FlowNode[];
  direction?: "horizontal" | "vertical";
}

export function RagFlow({ nodes, direction = "horizontal" }: RagFlowProps) {
  const arrow = direction === "vertical" ? "\u2193" : "\u2192";

  return (
    <div className={`rag-flow ${direction}`}>
      {nodes.map((node, index) => (
        <div className="rag-flow-item" key={node.id}>
          <RagNode {...node} />
          {index < nodes.length - 1 && <div className="flow-arrow">{arrow}</div>}
        </div>
      ))}
    </div>
  );
}
