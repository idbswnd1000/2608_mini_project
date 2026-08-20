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
  return (
    <div className={`rag-flow ${direction}`}>
      {nodes.map((node, index) => (
        <div className="rag-flow-item" key={node.id}>
          <RagNode {...node} />
          {index < nodes.length - 1 && <div className="flow-arrow">→</div>}
        </div>
      ))}
    </div>
  );
}
