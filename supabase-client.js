
(function(){
  'use strict';

  const config=window.COURT822_CONFIG||{};

  window.COURT822_CONFIGURED=Boolean(
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY
  );

  window.courtDb=window.COURT822_CONFIGURED
    ?window.supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true,
          flowType:'implicit'
        }
      }
    )
    :null;
})();
