// COURT 822 V4: read-only payment overview in the existing owner dashboard.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = { busy: false, loaded: false };
  const money = v => new Intl.NumberFormat("en-PH", {style:"currency",currency:"PHP"}).format(Number(v || 0));
  const el = (tag, text, cls = "") => {const node=document.createElement(tag);node.textContent=String(text ?? "");if(cls)node.className=cls;return node;};
  const message = (text, error = false) => {const node=$("paymentMessage");node.textContent=text;node.classList.toggle("owner-error",error);};
  async function requireOwner(){
    if(!window.courtDb) throw new Error("Supabase connection unavailable");
    const {data:auth,error:authError}=await courtDb.auth.getUser();
    if(authError || !auth?.user) throw new Error("Owner sign-in required");
    const {data,error}=await courtDb.rpc("court822_is_owner");
    if(error || data !== true) throw new Error("Owner access required");
  }
  async function loadTournaments(){
    await requireOwner();
    const {data,error}=await courtDb.from("tournaments").select("id,title").order("created_at",{ascending:false});
    if(error) throw error;
    const select=$("paymentTournamentSelect");
    const previous=select.value;
    select.replaceChildren(...(data||[]).map(t=>new Option(t.title,t.id)));
    if(previous && (data||[]).some(t=>t.id===previous))select.value=previous;
    state.loaded=true;
  }
  async function refresh(){
    if(state.busy)return;
    state.busy=true;$("paymentRefresh").disabled=true;
    message("Loading checkout statuses...");
    try{
      if(!state.loaded)await loadTournaments();
      await requireOwner();
      const tournamentId=$("paymentTournamentSelect").value;
      if(!tournamentId){message("No tournament selected");return;}
      const {data,error}=await courtDb.rpc("court822_owner_get_checkouts",{p_tournament_id:tournamentId});
      if(error)throw error;
      if(!Array.isArray(data))throw new Error("Unexpected checkout response");
      $("paymentAwaiting").textContent=data.filter(x=>x.status==="pending_verification").length;
      $("paymentConfirmed").textContent=data.filter(x=>x.status==="confirmed").length;
      $("paymentTotal").textContent=money(data.reduce((sum,x)=>sum+Number(x.total_amount||0),0));
      const list=$("paymentCheckoutList");list.replaceChildren();
      for(const x of data){
        const card=el("article","","card panel");
        card.append(el("h3",`Checkout ${String(x.checkout_id||"").slice(0,8)}`));
        const teamCount=Array.isArray(x.teams)?x.teams.length:0;
        card.append(el("p",`Status: ${x.status || "unknown"} | ${money(x.total_amount)} | ${teamCount} team(s)`));
        card.append(el("p","Owner verification action unavailable until payment-to-QR backend testing passes.","muted"));
        list.append(card);
      }
      if(!data.length)list.append(el("p","No submitted checkouts for this tournament.","muted"));
      message(`${data.length} checkout(s) loaded. This is a read-only overview; no payment has been verified here.`);
    }catch(e){message(e.message||"Unable to load payments",true);}
    finally{state.busy=false;$("paymentRefresh").disabled=false;}
  }
  $("paymentRefresh")?.addEventListener("click",refresh);
  $("paymentTournamentSelect")?.addEventListener("change",refresh);
  document.querySelector('[data-tab="payments"]')?.addEventListener("click",refresh);
})();
