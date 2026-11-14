(()=>{
'use strict';
const $=id=>document.getElementById(id);
let all=[],approvedVisible=[],busy=false;
const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n||0));
const note=s=>{if($('rosterMessage'))$('rosterMessage').textContent=s};
const normalized=s=>String(s??'').toLowerCase();
function approved(t){
  // The database confirmation guard requires verified payment and two distinct
  // authorized players before a checkout may transition to confirmed.
  return t.checkout_status==='confirmed' && t.team_status==='confirmed' &&
    t.owner_review_status==='approved';
}
function pending(t){
  return ['pending_payment','pending_verification'].includes(t.checkout_status) &&
    t.team_status==='pending';
}
function getPlayers(t){
  const ps=Array.isArray(t.players)?t.players:[];
  return [ps.find(p=>Number(p.position)===1),ps.find(p=>Number(p.position)===2)];
}
function makeRow(t,i){
  const [a,b]=getPlayers(t),ps=Array.isArray(t.players)?t.players:[];
  return [i+1,t.category_name||'',t.team_id||'',a?.name||'Not recorded',b?.name||'Not recorded',a?.email||'',b?.email||'',Number(a?.fee||0),Number(b?.fee||0),ps.reduce((n,p)=>n+Number(p.fee||0),0),[a?.entry_type||'N/A',b?.entry_type||'N/A'].join(' / '),t.checkout_status||'',t.owner_review_status||'',t.team_status||''];
}
function addCells(body,values,moneyCols=[]){
  const tr=document.createElement('tr');
  values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=moneyCols.includes(i)?money(value):String(value??'');tr.append(td)});
  body.append(tr);
}
function emptyRow(body,count,message){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=count;td.textContent=message;tr.append(td);body.append(tr)}
function render(){
  const cat=$('rosterCategory').value,query=normalized($('rosterSearch').value.trim());
  const approvedTeams=all.filter(approved).filter(t=>(!cat||t.category_id===cat)&&
    [t.team_id,t.category_name,...(t.players||[]).flatMap(p=>[p.name,p.email])].join(' ').toLowerCase().includes(query));
  approvedVisible=approvedTeams.map(makeRow);
  const body=$('rosterRows');body.replaceChildren();
  for(const row of approvedVisible)addCells(body,row,[7,8,9]);
  if(!approvedVisible.length)emptyRow(body,14,'No approved and paid teams match these filters.');
  $('rosterTeamCount').textContent=approvedVisible.length;
  $('rosterPlayerCount').textContent=approvedVisible.reduce((n,r)=>n+Number(r[3]!=='Not recorded')+Number(r[4]!=='Not recorded'),0);
  $('rosterFeeTotal').textContent=money(approvedVisible.reduce((n,r)=>n+r[9],0));
  const pendingTeams=all.filter(pending).filter(t=>(!cat||t.category_id===cat)&&
    [t.team_id,t.category_name,...(t.players||[]).flatMap(p=>[p.name,p.email])].join(' ').toLowerCase().includes(query));
  const pendingBody=$('pendingRosterRows');pendingBody.replaceChildren();
  for(const t of pendingTeams){const [a,b]=getPlayers(t);addCells(pendingBody,[t.category_name,t.team_id,a?.name||'Not recorded',b?.name||'Not recorded',a?.email||'',b?.email||'',t.checkout_status,t.team_status]);}
  if(!pendingTeams.length)emptyRow(pendingBody,8,'No pending teams match these filters.');
  $('pendingRosterMessage').textContent=`${pendingTeams.length} pending team(s). Review payments under Payment Verification.`;
}
async function load(){
  if(busy||!$('rosterTournament').value)return;
  busy=true;$('rosterRefresh').disabled=true;if($('pendingRosterRefresh'))$('pendingRosterRefresh').disabled=true;
  note('Loading approved and pending teams...');
  try{
    const {data,error}=await courtDb.rpc('court822_owner_get_team_roster',{p_tournament_id:$('rosterTournament').value});
    if(error)throw error;if(!Array.isArray(data))throw Error('Unexpected roster response');
    all=data;
    const sel=$('rosterCategory'),prev=sel.value;sel.replaceChildren(new Option('All categories',''));
    const cats=new Map(all.map(t=>[t.category_id,t.category_name]));
    for(const [id,name] of cats)sel.add(new Option(name,id));if(cats.has(prev))sel.value=prev;
    render();note(`${all.filter(approved).length} approved team(s); ${all.filter(pending).length} pending team(s). Auto-refreshes every 30 seconds.`);
  }catch(e){all=[];render();note('Unable to load roster: '+e.message)}
  finally{busy=false;$('rosterRefresh').disabled=false;if($('pendingRosterRefresh'))$('pendingRosterRefresh').disabled=false}
}
function csvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function exportCsv(){
  if(!approvedVisible.length){note('No approved players to export.');return}
  const header=['#','Category','Team ID','Player 1','Player 2','Player 1 Email','Player 2 Email','Player 1 Fee','Player 2 Fee','Team Total','Entry Types','Checkout Status','Owner Review','Team Status'];
  const content='\uFEFF'+[header,...approvedVisible].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='Court822_Approved_Roster_'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);note('Approved roster CSV exported.');
}
window.addEventListener('court822:roster',load);
$('rosterTournament').addEventListener('change',load);
$('rosterCategory').addEventListener('change',render);
$('rosterStatus').addEventListener('change',render);
$('rosterSearch').addEventListener('input',render);
$('rosterRefresh').addEventListener('click',load);
$('pendingRosterRefresh')?.addEventListener('click',load);
$('rosterExport').addEventListener('click',exportCsv);
setInterval(()=>{if(!document.hidden&&document.querySelector('#rosterTab.active'))load()},30000);
})();
