import { RECAPTCHA_SITE_KEY } from "./config.js";
import { showToast, loadRecaptcha } from "./utils.js";

const overlay = document.getElementById("contact-overlay");
const form = document.getElementById("contact-form");
const submitBtn = document.getElementById("ct-submit");


// Open / close
document.getElementById("contact-pill").addEventListener("click", () => {
  overlay.classList.remove("hide");
});
document.getElementById("contact-close").addEventListener("click", () => {
  overlay.classList.add("hide");
});
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) overlay.classList.add("hide");
});

// Clear invalid state on input
form.querySelectorAll("[required]").forEach((el) => {
  el.addEventListener("input", () => el.classList.remove("invalid"));
});

// Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  let hasEmpty = false;
  form.querySelectorAll("[required]").forEach((el) => {
    if (!el.value.trim()) { el.classList.add("invalid"); hasEmpty = true; }
    else el.classList.remove("invalid");
  });
  if (hasEmpty) return;

  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Sending…</span>';

  const name = document.getElementById("ct-name").value.trim();
  const email = document.getElementById("ct-email").value.trim();
  const phone = document.getElementById("ct-phone").value.trim();
  const message = document.getElementById("ct-message").value.trim();

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() =>
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "contact" }).then(resolve),
      ),
    );
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, formType: "contact", name, email, phone, message }),
    });
    const data = await res.json();
    if (data.success) {
      form.reset();
      overlay.classList.add("hide");
      setTimeout(() => showToast("Message sent!", "check", "JazakAllah Khair! InSyaAllah we'll get back to you soon."), 200);
    } else {
      showToast("Sending failed", "error", data.error || "Please try again.");
    }
  } catch (err) {
    console.error("Contact form error:", err);
    showToast("Sending failed", "error", "Check your connection.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginal;
  }
});
