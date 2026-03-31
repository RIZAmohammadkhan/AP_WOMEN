const test = require("node:test");
const assert = require("node:assert/strict");

const { ConversationStore } = require("../lib/conversation-store");

function pickColumns(row, columns) {
  if (!row || !columns) {
    return row || null;
  }

  const keys = columns.split(",").map((column) => column.trim());
  const picked = {};
  for (const key of keys) {
    picked[key] = row[key];
  }
  return picked;
}

function createFakeSupabaseClient(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.user_id, { ...row }]));

  return {
    rows,
    from() {
      const state = {
        columns: null,
        filterField: null,
        filterValue: null,
        payload: null,
        orderField: null,
        orderAscending: true,
      };

      const builder = {
        select(columns) {
          state.columns = columns;
          return builder;
        },
        eq(field, value) {
          state.filterField = field;
          state.filterValue = value;
          return builder;
        },
        maybeSingle: async () => {
          const key =
            state.filterField === "user_id"
              ? state.filterValue
              : state.payload?.user_id;
          const row = key ? rows.get(key) || null : null;
          return {
            data: pickColumns(row, state.columns),
            error: null,
          };
        },
        upsert(payload) {
          const current = rows.get(payload.user_id) || {};
          rows.set(payload.user_id, { ...current, ...payload });
          state.payload = payload;
          return builder;
        },
        delete() {
          return {
            eq: async (field, value) => {
              if (field === "user_id") {
                rows.delete(value);
              }
              return { error: null };
            },
          };
        },
        order(field, options = {}) {
          state.orderField = field;
          state.orderAscending = options.ascending !== false;
          return builder;
        },
        range: async (from, to) => {
          const list = [...rows.values()].sort((left, right) => {
            const leftValue = left[state.orderField];
            const rightValue = right[state.orderField];
            if (leftValue === rightValue) {
              return 0;
            }
            const comparison = leftValue < rightValue ? -1 : 1;
            return state.orderAscending ? comparison : -comparison;
          });

          return {
            data: list.slice(from, to + 1).map((row) => pickColumns(row, state.columns)),
            error: null,
          };
        },
      };

      return builder;
    },
  };
}

function createStore(initialRows = []) {
  return new ConversationStore({
    config: {
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "service-role-key",
      supabaseConversationsTable: "conversations",
    },
    supabaseClient: createFakeSupabaseClient(initialRows),
  });
}

test("resetConversation clears stored content and increments session_version", async () => {
  const store = createStore([
    {
      user_id: "user-1",
      summary: "Old summary",
      messages: [{ role: "user", text: "hello" }],
      session_version: 3,
      updated_at: "2026-03-31T00:00:00.000Z",
    },
  ]);

  const result = await store.resetConversation("user-1");

  assert.equal(result.clearedConversation.summary, "Old summary");
  assert.equal(result.clearedConversation.messages.length, 1);
  assert.equal(result.conversation.summary, "");
  assert.deepEqual(result.conversation.messages, []);
  assert.equal(result.conversation.sessionVersion, 4);
});

test("updateConversation refuses stale writes after a reset", async () => {
  const store = createStore([
    {
      user_id: "user-1",
      summary: "Old summary",
      messages: [{ role: "user", text: "hello" }],
      session_version: 0,
      updated_at: "2026-03-31T00:00:00.000Z",
    },
  ]);

  await store.resetConversation("user-1");
  const result = await store.updateConversation(
    "user-1",
    () => ({
      summary: "Should not save",
      messages: [{ role: "assistant", text: "stale" }],
    }),
    { expectedSessionVersion: 0 }
  );
  const latest = await store.getConversation("user-1");

  assert.equal(result.status, "stale_after_reset");
  assert.equal(latest.summary, "");
  assert.deepEqual(latest.messages, []);
  assert.equal(latest.sessionVersion, 1);
});
