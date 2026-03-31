const { createClient } = require("@supabase/supabase-js");

function createSupabaseAdminClient(config) {
  const isConfigured = Boolean(
    config.supabaseUrl && config.supabaseServiceRoleKey
  );

  if (!isConfigured) {
    return {
      isConfigured: false,
      client: null,
    };
  }

  const client = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return {
    isConfigured: true,
    client,
  };
}

module.exports = { createSupabaseAdminClient };
