window.money = value => `₱${Number(value || 0).toLocaleString()}`;
window.escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
window.showToast = message => {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.courtToastTimer);
  window.courtToastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
};
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest(".modal").classList.add("hidden")));
