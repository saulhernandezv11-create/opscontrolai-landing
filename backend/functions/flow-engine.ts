// ============================================================
// functions/flow-engine.ts – Predefined conversation flow executor
// Supports: message, question, condition, api-call, handoff nodes
// ============================================================

import axios from 'axios';
import { Containers } from '../shared/cosmos-client';
import type { Tenant } from '../models/tenant';
import type { Conversation } from '../models/conversation';
import type { ConversationFlow, FlowNode } from '../models/contact';

export interface LoggerContext {
    log: {
        info(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
    };
}

export interface FlowExecutionResult {
    responseText: string;
    nextNodeId?: string;
    completed: boolean;
    variables?: Record<string, string>;
}

/** Resolves a flow and finds the next unprocessed node. */
async function loadFlow(tenantId: string, flowId: string): Promise<ConversationFlow | null> {
    try {
        const { resource } = await Containers.flows()
            .item(flowId, tenantId)
            .read<ConversationFlow>();
        return resource ?? null;
    } catch {
        return null;
    }
}

/** Interpolates {{variableName}} placeholders in a template string. */
function interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

/** Evaluates a simple condition string like `"{{answer}} == 'cita'"`. */
function evaluateCondition(condition: string, variables: Record<string, string>): boolean {
    const resolved = interpolate(condition, variables);
    try {
        // Safe evaluation: only allow simple comparisons
        const match = resolved.match(/^['"]?(.+?)['"]?\s*(==|!=|contains)\s*['"]?(.+?)['"]?$/i);
        if (!match) return false;
        const [, left, op, right] = match;
        if (op === '==') return left.trim() === right.trim();
        if (op === '!=') return left.trim() !== right.trim();
        if (op.toLowerCase() === 'contains') return left.toLowerCase().includes(right.toLowerCase());
    } catch {
        return false;
    }
    return false;
}

/**
 * Executes one step of a conversation flow.
 *
 * Each call processes a single node and returns:
 * - responseText: what to send to the user
 * - nextNodeId: which node to process on the next message
 * - completed: whether the flow has ended
 */
export async function executeFlow(
    tenant: Tenant,
    conversation: Conversation,
    userInput: string,
    context: LoggerContext,
): Promise<FlowExecutionResult> {
    // Load flow from Cosmos DB
    const flowId = conversation.activeFlowId!;
    const flow = await loadFlow(tenant.id, flowId);

    if (!flow) {
        context.log.warn('[FlowEngine] Flow not found', { flowId, tenantId: tenant.id });
        return { responseText: '', completed: true };
    }

    // Variables collected throughout the flow
    const variables: Record<string, string> = { userInput };

    // Determine which node to execute
    const currentNodeId = conversation.activeFlowNodeId ?? flow.entryNodeId;
    const currentNode = flow.nodes.find((n) => n.id === currentNodeId);

    if (!currentNode) {
        return { responseText: '', completed: true };
    }

    // If this is a question node and we have user input (second call), store the answer
    // and advance to the appropriate next node
    if (currentNode.type === 'question' && userInput && conversation.activeFlowNodeId) {
        variables[currentNode.config.variable ?? 'answer'] = userInput;

        // Check routes (quick reply button IDs)
        if (currentNode.config.routes) {
            const routeKey = Object.keys(currentNode.config.routes).find(
                (k) => k.toLowerCase() === userInput.toLowerCase(),
            );
            if (routeKey) {
                return executeNodeById(flow, currentNode.config.routes[routeKey], variables, tenant, context);
            }
        }
        // Fall through to default next
        if (currentNode.config.next) {
            return executeNodeById(flow, currentNode.config.next, variables, tenant, context);
        }
        return { responseText: '', completed: true };
    }

    return executeNodeById(flow, currentNodeId, variables, tenant, context);
}

async function executeNodeById(
    flow: ConversationFlow,
    nodeId: string,
    variables: Record<string, string>,
    tenant: Tenant,
    context: LoggerContext,
): Promise<FlowExecutionResult> {
    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) return { responseText: '', completed: true };

    switch (node.type) {
        case 'message': {
            const text = interpolate(node.config.message ?? '', variables);
            const nextId = node.config.next;
            if (nextId) {
                // Auto-advance to next node if it's also a message
                const next = flow.nodes.find((n) => n.id === nextId);
                if (next?.type === 'message') {
                    const nextResult = await executeNodeById(flow, nextId, variables, tenant, context);
                    return { ...nextResult, responseText: `${text}\n\n${nextResult.responseText}` };
                }
                return { responseText: text, nextNodeId: nextId, completed: false };
            }
            return { responseText: text, completed: true };
        }

        case 'question': {
            const text = interpolate(node.config.message ?? '', variables);
            const options = node.config.options ?? [];
            const formattedOptions = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
            return {
                responseText: options.length > 0 ? `${text}\n\n${formattedOptions}` : text,
                nextNodeId: nodeId, // Stay on this node waiting for user response
                completed: false,
            };
        }

        case 'condition': {
            const conditionMet = evaluateCondition(node.config.condition ?? '', variables);
            if (conditionMet && node.config.next) {
                return executeNodeById(flow, node.config.next, variables, tenant, context);
            }
            // No matching route → flow ends
            return { responseText: '', completed: true };
        }

        case 'api-call': {
            try {
                const body = node.config.apiBody ? interpolate(node.config.apiBody, variables) : undefined;
                const response = await axios({
                    method: node.config.apiMethod ?? 'POST',
                    url: node.config.apiUrl!,
                    headers: node.config.apiHeaders,
                    data: body ? JSON.parse(body) : undefined,
                    timeout: 5000,
                });
                variables['apiResponse'] = JSON.stringify(response.data);
                context.log.info('[FlowEngine] API call success', { nodeId: node.id });
            } catch (err) {
                context.log.error('[FlowEngine] API call failed', { nodeId: node.id, error: err });
                variables['apiResponse'] = 'error';
            }
            if (node.config.next) {
                return executeNodeById(flow, node.config.next, variables, tenant, context);
            }
            return { responseText: '', completed: true };
        }

        case 'handoff': {
            const msg =
                node.config.handoffMessage ??
                'Te voy a conectar con un agente humano. Por favor espera un momento. 🙏';
            context.log.info('[FlowEngine] Handoff triggered', { tenantId: tenant.id });
            return { responseText: msg, completed: true, variables };
        }

        default:
            return { responseText: '', completed: true };
    }
}
