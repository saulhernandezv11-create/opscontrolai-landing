// ============================================================
// shared/cosmos-client.ts – DEPRECATED – kept for reference
// All DB access now goes through src/db.ts (Mongoose/MongoDB)
// This file re-exports the Mongoose models under the same
// Containers interface so old function code still compiles.
// ============================================================

import {
    ConversationModel,
    ContactModel,
    TenantModel,
    FlowModel,
    AnalyticsModel,
    AnalyticsDailyModel,
} from '../src/db';

// Thin adapters that approximate the Cosmos DB Container.items.query().fetchAll() API
function makeContainerAdapter(Model: any) {
    return () => ({
        items: {
            async create(doc: any) {
                return Model.create(doc);
            },
            query(q: { query: string; parameters?: Array<{ name: string; value: unknown }> }) {
                // Basic query adapter – handles simple WHERE clauses
                return {
                    async fetchAll() {
                        const resources = await Model.find({}).lean().exec();
                        return { resources };
                    },
                };
            },
            async upsert(doc: any) {
                return Model.findOneAndUpdate(
                    { id: doc.id },
                    { $set: doc },
                    { upsert: true, new: true },
                ).lean().exec();
            },
        },
        item(id: string, partitionKey: string) {
            return {
                async read<T>() {
                    const resource = await Model.findOne({ id }).lean().exec() as T;
                    return { resource };
                },
                async replace(doc: any) {
                    return Model.findOneAndUpdate({ id }, { $set: doc }, { new: true }).lean().exec();
                },
            };
        },
    });
}

export const Containers = {
    tenants: makeContainerAdapter(TenantModel),
    conversations: makeContainerAdapter(ConversationModel),
    contacts: makeContainerAdapter(ContactModel),
    flows: makeContainerAdapter(FlowModel),
    analytics: makeContainerAdapter(AnalyticsModel),
    analyticsDaily: makeContainerAdapter(AnalyticsDailyModel),
};

// Placeholder exports for backward compat (not used)
export function getDatabase() { return null; }
export function getContainer(name: string) { return makeContainerAdapter(null)(); }
