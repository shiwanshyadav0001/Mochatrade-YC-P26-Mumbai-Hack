from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any


DEFAULT_RELATIONSHIP_STRENGTHS: dict[str, float] = {
    "WITHDREW_TO": 0.95,
    "USES_WALLET": 0.95,
    "USED_DEVICE": 0.80,
    "USES_DEVICE": 0.80,
    "LOGGED_FROM": 0.45,
    "USES_IP": 0.45,
    "DEFAULT": 0.50,
}


@dataclass
class GraphPath:
    source: str
    target: str
    depth: int
    nodes: list[str]
    edges: list[dict[str, Any]]
    relationship_types: list[str]
    aggregate_strength: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "target": self.target,
            "depth": self.depth,
            "nodes": self.nodes,
            "edges": self.edges,
            "relationship_types": self.relationship_types,
            "aggregate_strength": round(self.aggregate_strength, 3),
        }


@dataclass
class GraphCluster:
    cluster_id: str
    nodes: list[str]
    edges: list[dict[str, Any]]
    affected_traders: list[str]
    shared_entities: list[str]
    relationship_types: list[str]
    max_relationship_strength: float
    is_suspicious: bool
    suspicious_activity_summary: str
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "cluster_id": self.cluster_id,
            "nodes": self.nodes,
            "edges": self.edges,
            "affected_traders": self.affected_traders,
            "shared_entities": self.shared_entities,
            "relationship_types": self.relationship_types,
            "max_relationship_strength": round(self.max_relationship_strength, 3),
            "is_suspicious": self.is_suspicious,
            "suspicious_activity_summary": self.suspicious_activity_summary,
            "explanation": self.explanation,
        }


@dataclass
class GraphRiskSignal:
    category: str
    feature: str
    severity: float
    contribution: float
    reason: str
    evidence: dict[str, Any]
    rule_code: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "category": self.category,
            "feature": self.feature,
            "severity": self.severity,
            "contribution": self.contribution,
            "reason": self.reason,
            "evidence": self.evidence,
            "rule_code": self.rule_code,
        }


class GraphIntelligenceEngine:
    """Production-grade graph intelligence engine supporting multi-hop traversal,

    cycle protection, relationship strength weighting, cluster detection, and explainability.

    """

    def __init__(self, relationship_strengths: dict[str, float] | None = None) -> None:
        self.strengths = dict(DEFAULT_RELATIONSHIP_STRENGTHS)
        if relationship_strengths:
            self.strengths.update(relationship_strengths)

    def get_relationship_strength(self, link_type: str) -> float:
        return self.strengths.get(link_type.upper(), self.strengths["DEFAULT"])

    @staticmethod
    def _build_adjacency(links: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        """Build bidirectional adjacency list with edge metadata."""
        adj: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for link in links:
            s, t = link["source"], link["target"]
            adj[s].append({"neighbor": t, "type": link["type"], "evidence": link.get("evidence", []), "link": link})
            adj[t].append({"neighbor": s, "type": link["type"], "evidence": link.get("evidence", []), "link": link})
        return adj

    def traverse(
        self,
        links: list[dict[str, Any]],
        root: str,
        max_depth: int = 3,
        relationship_types: set[str] | None = None,
    ) -> dict[str, Any]:
        """Breadth-first multi-hop graph traversal with cycle protection.

        Returns visited nodes, edges, node depths, and paths from root.

        """
        adj = self._build_adjacency(links)
        visited: set[str] = {root}
        queue: deque[tuple[str, int, list[str], list[dict[str, Any]]]] = deque([(root, 0, [root], [])])

        paths: dict[str, GraphPath] = {}
        subgraph_edges: list[dict[str, Any]] = []
        edge_seen: set[tuple[str, str, str]] = set()

        while queue:
            curr, depth, path_nodes, path_edges = queue.popleft()

            if depth > 0 and curr != root:
                rel_types = [e["type"] for e in path_edges]
                avg_strength = (
                    sum(self.get_relationship_strength(t) for t in rel_types) / len(rel_types)
                    if rel_types
                    else 0.5
                )
                paths[curr] = GraphPath(
                    source=root,
                    target=curr,
                    depth=depth,
                    nodes=list(path_nodes),
                    edges=list(path_edges),
                    relationship_types=rel_types,
                    aggregate_strength=avg_strength,
                )

            if depth >= max_depth:
                continue

            for edge in adj.get(curr, []):
                neighbor = edge["neighbor"]
                link_type = edge["type"]

                if relationship_types and link_type.upper() not in relationship_types:
                    continue

                # Record edge in subgraph
                edge_sig = tuple(sorted([curr, neighbor])) + (link_type,)
                if edge_sig not in edge_seen:
                    edge_seen.add(edge_sig)
                    subgraph_edges.append(edge["link"])

                # Cycle protection: only enqueue if not visited
                if neighbor not in visited:
                    visited.add(neighbor)
                    new_path_edges = path_edges + [edge["link"]]
                    queue.append((neighbor, depth + 1, path_nodes + [neighbor], new_path_edges))

        return {
            "root": root,
            "max_depth": max_depth,
            "nodes": sorted(visited),
            "edges": subgraph_edges,
            "paths": {k: v.to_dict() for k, v in paths.items()},
            "node_count": len(visited),
            "edge_count": len(subgraph_edges),
        }

    def find_shortest_path(
        self,
        links: list[dict[str, Any]],
        source: str,
        target: str,
        max_depth: int = 5,
    ) -> GraphPath | None:
        """Finds shortest path between two nodes with cycle protection."""
        if source == target:
            return GraphPath(source, target, 0, [source], [], [], 1.0)

        adj = self._build_adjacency(links)
        visited = {source}
        queue: deque[tuple[str, list[str], list[dict[str, Any]]]] = deque([(source, [source], [])])

        while queue:
            curr, path_nodes, path_edges = queue.popleft()
            if len(path_nodes) - 1 >= max_depth:
                continue

            for edge in adj.get(curr, []):
                nbr = edge["neighbor"]
                if nbr == target:
                    full_nodes = path_nodes + [nbr]
                    full_edges = path_edges + [edge["link"]]
                    rel_types = [e["type"] for e in full_edges]
                    avg_strength = sum(self.get_relationship_strength(t) for t in rel_types) / len(rel_types)
                    return GraphPath(
                        source=source,
                        target=target,
                        depth=len(full_edges),
                        nodes=full_nodes,
                        edges=full_edges,
                        relationship_types=rel_types,
                        aggregate_strength=avg_strength,
                    )

                if nbr not in visited:
                    visited.add(nbr)
                    queue.append((nbr, path_nodes + [nbr], path_edges + [edge["link"]]))

        return None

    def detect_connected_clusters(
        self,
        links: list[dict[str, Any]],
        traders_map: dict[str, Any] | None = None,
    ) -> list[GraphCluster]:
        """Detects connected components and evaluates whether clusters are suspicious

        based on shared infrastructure corroboration, trader counts, and behavior.

        """
        adj = self._build_adjacency(links)
        all_nodes = set(adj.keys())
        visited: set[str] = set()
        clusters: list[GraphCluster] = []
        cluster_idx = 1

        for start_node in sorted(all_nodes):
            if start_node in visited:
                continue

            # BFS for component
            comp_nodes: set[str] = {start_node}
            visited.add(start_node)
            queue = deque([start_node])
            comp_edges: list[dict[str, Any]] = []
            edge_seen: set[tuple[str, str, str]] = set()

            while queue:
                curr = queue.popleft()
                for edge in adj.get(curr, []):
                    nbr = edge["neighbor"]
                    link_type = edge["type"]

                    edge_sig = tuple(sorted([curr, nbr])) + (link_type,)
                    if edge_sig not in edge_seen:
                        edge_seen.add(edge_sig)
                        comp_edges.append(edge["link"])

                    if nbr not in visited:
                        visited.add(nbr)
                        comp_nodes.add(nbr)
                        queue.append(nbr)

            affected_traders = sorted(
                [n.replace("TRADER-", "") for n in comp_nodes if n.startswith("TRADER-")]
            )
            shared_entities = sorted(
                [n for n in comp_nodes if not n.startswith("TRADER-")]
            )

            # Only analyze components with 2+ nodes
            if len(comp_nodes) < 2:
                continue

            rel_types = sorted({e["type"] for e in comp_edges})
            strengths = [self.get_relationship_strength(t) for t in rel_types]
            max_strength = max(strengths) if strengths else 0.5

            # Evaluate suspiciousness:
            # Map each infrastructure entity to the set of traders directly connected to it
            traders_per_entity: dict[str, set[str]] = defaultdict(set)
            for e in comp_edges:
                s, t = e["source"], e["target"]
                if s.startswith("TRADER-") and not t.startswith("TRADER-"):
                    traders_per_entity[t].add(s.replace("TRADER-", ""))
                elif t.startswith("TRADER-") and not s.startswith("TRADER-"):
                    traders_per_entity[s].add(t.replace("TRADER-", ""))

            shared_wallets = [ent for ent, tids in traders_per_entity.items() if "WALLET" in ent and len(tids) >= 2]
            shared_devices = [ent for ent, tids in traders_per_entity.items() if ("DEV" in ent or "DEVICE" in ent) and len(tids) >= 2]
            shared_ips = [ent for ent, tids in traders_per_entity.items() if ("IP" in ent or "SUBNET" in ent) and len(tids) >= 3]

            has_shared_wallet = len(shared_wallets) > 0
            has_shared_device = len(shared_devices) > 0
            has_shared_ip = len(shared_ips) > 0

            is_suspicious = False
            reasons = []

            if len(affected_traders) >= 2:
                if has_shared_wallet:
                    is_suspicious = True
                    reasons.append(f"{len(affected_traders)} traders share destination crypto wallet(s)")
                if has_shared_device:
                    is_suspicious = True
                    reasons.append(f"{len(affected_traders)} traders share hardware device identifier(s)")
                if has_shared_ip:
                    is_suspicious = True
                    reasons.append(f"{len(affected_traders)} traders share IP network infrastructure")

            # Check trader trust levels if available
            if traders_map and len(affected_traders) >= 2:
                low_trust_count = sum(
                    1 for tid in affected_traders if traders_map.get(tid, {}).get("trust_score", 94.0) < 60.0
                )
                if low_trust_count >= 2:
                    is_suspicious = True
                    reasons.append(f"{low_trust_count} connected traders exhibit degraded trust")

            summary = "; ".join(reasons) if reasons else "Common infrastructure without verified risk indicators"
            explanation = (
                f"Cluster contains {len(affected_traders)} traders and {len(shared_entities)} infrastructure nodes. "
                + (f"Suspicious activity indicators: {summary}." if is_suspicious else "No elevated risk detected.")
            )

            cluster = GraphCluster(
                cluster_id=f"CLUSTER-{cluster_idx:03d}",
                nodes=sorted(comp_nodes),
                edges=comp_edges,
                affected_traders=affected_traders,
                shared_entities=shared_entities,
                relationship_types=rel_types,
                max_relationship_strength=max_strength,
                is_suspicious=is_suspicious,
                suspicious_activity_summary=summary,
                explanation=explanation,
            )
            clusters.append(cluster)
            cluster_idx += 1

        return clusters

    def evaluate_graph_risk_signals(
        self,
        trader_id: str,
        links: list[dict[str, Any]],
        traders_map: dict[str, Any] | None = None,
        active_event_type: str | None = None,
    ) -> list[GraphRiskSignal]:
        """Extracts structured graph risk signals for a trader using multi-hop analysis

        and algorithmic cluster detection, avoiding double-counting correlated evidence.

        """
        root = f"TRADER-{trader_id}"
        traversal = self.traverse(links, root, max_depth=3)
        clusters = self.detect_connected_clusters(links, traders_map)

        # Find cluster containing root
        my_cluster = next((c for c in clusters if root in c.nodes), None)
        signals: list[GraphRiskSignal] = []

        if not my_cluster or len(my_cluster.affected_traders) <= 1:
            return signals

        other_traders = [tid for tid in my_cluster.affected_traders if tid != trader_id]
        if not other_traders:
            return signals

        # Identify entities trader_id directly connects to
        my_entities = set()
        for e in my_cluster.edges:
            s, t = e["source"], e["target"]
            if s == f"TRADER-{trader_id}":
                my_entities.add(t)
            elif t == f"TRADER-{trader_id}":
                my_entities.add(s)

        # Map each entity to other traders directly connected to it
        entity_traders: dict[str, set[str]] = defaultdict(set)
        for e in my_cluster.edges:
            s, t = e["source"], e["target"]
            if s.startswith("TRADER-") and not t.startswith("TRADER-"):
                entity_traders[t].add(s.replace("TRADER-", ""))
            elif t.startswith("TRADER-") and not s.startswith("TRADER-"):
                entity_traders[s].add(t.replace("TRADER-", ""))

        directly_shared = {
            ent for ent in my_entities if len(entity_traders[ent] - {trader_id}) >= 1
        }

        shared_wallet = next((e for e in directly_shared if "WALLET" in e), None)
        shared_device = next((e for e in directly_shared if "DEV" in e or "DEVICE" in e), None)
        shared_ip = next((e for e in directly_shared if ("IP" in e or "SUBNET" in e) and len(entity_traders[e] - {trader_id}) >= 2), None)

        has_wallet = shared_wallet is not None
        has_device = shared_device is not None
        has_ip = shared_ip is not None

        # 0. Overarching Suspicious Cluster Signal (only if cluster is suspicious and trader directly shares high-strength node)
        if my_cluster.is_suspicious and (has_wallet or has_device or has_ip):
            signals.append(
                GraphRiskSignal(
                    category="relationships",
                    feature="shared_cluster",
                    severity=76.0,
                    contribution=0.0,
                    reason=f"Trader #{trader_id} operates within suspicious infrastructure cluster ({my_cluster.cluster_id}): {my_cluster.suspicious_activity_summary}",
                    evidence={
                        "id": f"CLUSTER-{my_cluster.cluster_id}",
                        "type": "RELATIONSHIP",
                        "label": f"{len(my_cluster.affected_traders)} traders share infrastructure ({my_cluster.suspicious_activity_summary})",
                        "cluster_id": my_cluster.cluster_id,
                        "connected_traders": other_traders,
                    },
                    rule_code="SHARED_INFRASTRUCTURE_CLUSTER",
                )
            )

        # 1. Shared Wallet Cluster (Highest severity - 82.0)
        if has_wallet:
            wallet_id = shared_wallet
            signals.append(
                GraphRiskSignal(
                    category="relationships",
                    feature="shared_wallet_cluster",
                    severity=82.0,
                    contribution=0.0,
                    reason=f"Trader #{trader_id} shares destination wallet ({wallet_id}) with {len(other_traders)} other trader(s): {', '.join('#' + t for t in other_traders[:3])}",
                    evidence={
                        "id": f"GRAPH-WALLET-{trader_id}",
                        "type": "RELATIONSHIP",
                        "label": f"Shared destination wallet with {len(other_traders)} trader(s)",
                        "cluster_id": my_cluster.cluster_id,
                        "connected_traders": other_traders,
                        "shared_entity": wallet_id,
                        "depth": 2,
                    },
                    rule_code="SHARED_WALLET_CLUSTER",
                )
            )

        # 2. Shared Device Cluster (Severity - 72.0)
        # Anti-double-counting: if wallet is already present, reduce device severity to 60.0 to represent correlated synergy
        if has_device:
            dev_id = shared_device
            dev_sev = 60.0 if has_wallet else 72.0
            signals.append(
                GraphRiskSignal(
                    category="relationships",
                    feature="shared_device_cluster",
                    severity=dev_sev,
                    contribution=0.0,
                    reason=f"Trader #{trader_id} shares hardware device ({dev_id}) with {len(other_traders)} other trader(s): {', '.join('#' + t for t in other_traders[:3])}",
                    evidence={
                        "id": f"GRAPH-DEV-{trader_id}",
                        "type": "RELATIONSHIP",
                        "label": f"Shared device hardware with {len(other_traders)} trader(s)",
                        "cluster_id": my_cluster.cluster_id,
                        "connected_traders": other_traders,
                        "shared_entity": dev_id,
                        "depth": 2,
                    },
                    rule_code="SHARED_DEVICE_CLUSTER",
                )
            )

        # 3. Shared IP Cluster (Lower severity - 42.0, only if 2+ other traders share it)
        if has_ip and not (has_wallet and has_device):
            ip_id = shared_ip
            signals.append(
                GraphRiskSignal(
                    category="relationships",
                    feature="shared_ip_cluster",
                    severity=42.0,
                    contribution=0.0,
                    reason=f"Trader #{trader_id} shares network IP ({ip_id}) with {len(other_traders)} other trader(s)",
                    evidence={
                        "id": f"GRAPH-IP-{trader_id}",
                        "type": "RELATIONSHIP",
                        "label": f"Shared IP network with {len(other_traders)} trader(s)",
                        "cluster_id": my_cluster.cluster_id,
                        "connected_traders": other_traders,
                        "shared_entity": ip_id,
                        "depth": 2,
                    },
                    rule_code="SHARED_IP_CLUSTER",
                )
            )

        # 4. Multi-hop Suspicious Connection (3-hop indirect connection to degraded trader)
        for other_tid in other_traders:
            other_node = f"TRADER-{other_tid}"
            path_dict = traversal["paths"].get(other_node)
            if path_dict and path_dict["depth"] >= 2:
                other_trust = traders_map.get(other_tid, {}).get("trust_score", 94.0) if traders_map else 94.0
                if other_trust < 50.0:
                    signals.append(
                        GraphRiskSignal(
                            category="relationships",
                            feature="multi_hop_connection",
                            severity=68.0,
                            contribution=0.0,
                            reason=f"Indirect {path_dict['depth']}-hop connection to degraded trader #{other_tid} (trust={other_trust}) via shared infrastructure",
                            evidence={
                                "id": f"GRAPH-MULTIHOP-{other_tid}",
                                "type": "RELATIONSHIP",
                                "label": f"{path_dict['depth']}-hop connection to degraded trader #{other_tid}",
                                "path": path_dict["nodes"],
                                "depth": path_dict["depth"],
                                "target_trust": other_trust,
                            },
                            rule_code="MULTI_HOP_SUSPICIOUS_CONNECTION",
                        )
                    )
                    break

        # 5. Coordinated Activity (if active event is WITHDRAWAL and other traders in cluster have withdrawn)
        if active_event_type == "WITHDRAWAL" and (has_wallet or has_device):
            signals.append(
                GraphRiskSignal(
                    category="relationships",
                    feature="coordinated_withdrawal",
                    severity=78.0,
                    contribution=0.0,
                    reason=f"Coordinated withdrawal from shared infrastructure cluster ({my_cluster.cluster_id})",
                    evidence={
                        "id": f"GRAPH-COORD-{trader_id}",
                        "type": "RELATIONSHIP",
                        "label": f"Coordinated sensitive withdrawal in cluster {my_cluster.cluster_id}",
                        "cluster_id": my_cluster.cluster_id,
                    },
                    rule_code="COORDINATED_ACTIVITY",
                )
            )

        return signals

    def format_trader_graph_response(
        self,
        trader_id: str,
        links: list[dict[str, Any]],
        traders_map: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Backward-compatible response format for GET /api/traders/{trader_id}/graph

        utilizing genuine multi-hop traversal and cluster detection.

        """
        root = f"TRADER-{trader_id}"
        traversal = self.traverse(links, root, max_depth=3)
        clusters = self.detect_connected_clusters(links, traders_map)

        # Identify which nodes belong to a suspicious cluster
        cluster_node_set: set[str] = set()
        for cl in clusters:
            if cl.is_suspicious and root in cl.nodes:
                cluster_node_set.update(cl.nodes)

        nodes = []
        for entity in traversal["nodes"]:
            raw_type = entity.split("-", 1)[0]
            if raw_type in {"DEV", "DEVICE"}:
                node_type = "DEVICE"
            elif raw_type in {"IP", "SUBNET"}:
                node_type = "IP"
            elif raw_type in {"WALLET", "ADDRESS"}:
                node_type = "WALLET"
            elif raw_type in {"TRADER", "USER"}:
                node_type = "TRADER"
            else:
                node_type = raw_type

            is_cluster = entity in cluster_node_set

            if node_type == "TRADER":
                tid = entity.replace("TRADER-", "")
                t_score = traders_map.get(tid, {}).get("trust_score", 86.0) if traders_map else 86.0
                risk = round(100.0 - t_score, 1)
                if is_cluster:
                    risk = max(risk, 78.0)
            else:
                risk = 85.0 if is_cluster else 24.0

            nodes.append({
                "id": entity,
                "label": entity.replace("TRADER-", "#"),
                "type": node_type,
                "risk": risk,
                "is_cluster": is_cluster,
            })

        has_cluster = any(n.get("is_cluster") for n in nodes)
        summary = (
            f"{len(nodes)} entities and {len(traversal['edges'])} evidence-backed relationships "
            + ("(Monitored Risk Cluster Detected)" if has_cluster else "(No elevated cluster detected)")
        )

        return {
            "nodes": nodes,
            "edges": traversal["edges"],
            "summary": summary,
            "has_cluster": has_cluster,
        }

    def format_intelligence_response(
        self,
        trader_id: str,
        links: list[dict[str, Any]],
        traders_map: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Comprehensive intelligence response for GET /api/traders/{trader_id}/graph/intelligence."""
        root = f"TRADER-{trader_id}"
        traversal = self.traverse(links, root, max_depth=3)
        clusters = self.detect_connected_clusters(links, traders_map)
        my_cluster = next((c for c in clusters if root in c.nodes), None)
        risk_signals = self.evaluate_graph_risk_signals(trader_id, links, traders_map)

        return {
            "trader_id": trader_id,
            "root": root,
            "traversal": traversal,
            "cluster": my_cluster.to_dict() if my_cluster else None,
            "all_clusters": [c.to_dict() for c in clusters if root in c.nodes],
            "risk_signals": [s.to_dict() for s in risk_signals],
            "relationship_strengths": self.strengths,
            "summary": my_cluster.explanation if my_cluster else "No connected cluster detected for this trader.",
        }

    def format_system_graph_response(
        self,
        links: list[dict[str, Any]],
        traders_map: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Formats a system-wide topology response including all active entities and clusters."""
        clusters = self.detect_connected_clusters(links, traders_map)
        cluster_node_set: set[str] = set()
        for cl in clusters:
            if cl.is_suspicious:
                cluster_node_set.update(cl.nodes)

        unique_nodes: set[str] = set()
        edges = []
        for l in links:
            s, t = l["source"], l["target"]
            unique_nodes.add(s)
            unique_nodes.add(t)
            edges.append({
                "source": s,
                "target": t,
                "type": l.get("type", "CONNECTED"),
                "strength": self.get_relationship_strength(l.get("type", "CONNECTED")),
            })

        nodes = []
        for entity in sorted(unique_nodes):
            raw_type = entity.split("-", 1)[0]
            if raw_type in {"DEV", "DEVICE"}:
                node_type = "DEVICE"
            elif raw_type in {"IP", "SUBNET"}:
                node_type = "IP"
            elif raw_type in {"WALLET", "ADDRESS"}:
                node_type = "WALLET"
            elif raw_type in {"TRADER", "USER"}:
                node_type = "TRADER"
            else:
                node_type = raw_type

            is_cluster = entity in cluster_node_set
            if node_type == "TRADER":
                tid = entity.replace("TRADER-", "")
                t_score = traders_map.get(tid, {}).get("trust_score", 86.0) if traders_map else 86.0
                risk = round(100.0 - t_score, 1)
                if is_cluster:
                    risk = max(risk, 78.0)
            else:
                risk = 85.0 if is_cluster else 24.0

            nodes.append({
                "id": entity,
                "label": entity.replace("TRADER-", "#"),
                "type": node_type,
                "risk": risk,
                "is_cluster": is_cluster,
            })

        has_cluster = any(n.get("is_cluster") for n in nodes)
        suspicious_count = sum(1 for c in clusters if c.is_suspicious)
        summary = (
            f"System-wide topology: {len(nodes)} entities, {len(edges)} relationships, "
            f"{len(clusters)} connected clusters ({suspicious_count} suspicious)."
        )

        return {
            "nodes": nodes,
            "edges": edges,
            "clusters": [c.to_dict() for c in clusters],
            "summary": summary,
            "has_cluster": has_cluster,
        }

