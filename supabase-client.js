(function () {
  const config = window.COURT822_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.startsWith("YOUR_");
  window.COURT822_CONFIGURED = Boolean(configured);
  window.courtDb = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
})();
