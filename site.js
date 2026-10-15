window.money=v=>`₱${Number(v||0).toLocaleString()}`;
window.escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
window.timeLabel=v=>new Date(`2000-01-01T${v}`).toLocaleTimeString("en-PH",{hour:"numeric",minute:"2-digit"});
window.dateLabel=v=>new Date(`${v}T00:00:00`).toLocaleDateString("en-PH",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
window.showToast=m=>{const t=document.getElementById("toast");if(!t)return;t.textContent=m;t.classList.add("show");clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.classList.remove("show"),3200)};
