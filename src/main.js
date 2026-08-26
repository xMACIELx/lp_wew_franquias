import "./style.css";

const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navMobile = document.querySelector("[data-nav-mobile]");

function updateHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}
updateHeaderState();
window.addEventListener("scroll", updateHeaderState, { passive: true });

if (navToggle && navMobile) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMobile.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  navMobile.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navMobile.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Abrir menu");
      document.body.style.overflow = "";
    });
  });
}

const revealSections = document.querySelectorAll("[data-reveal]");
if ("IntersectionObserver" in window && revealSections.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
  );
  revealSections.forEach((section) => observer.observe(section));
} else {
  revealSections.forEach((section) => section.classList.add("is-visible"));
}

const phoneInput = document.querySelector('[data-mask="phone"]');
if (phoneInput) {
  phoneInput.addEventListener("input", () => {
    const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
    let formatted = digits;
    if (digits.length > 2) formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length > 7) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    } else if (digits.length > 6) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    phoneInput.value = formatted;
  });
}

const cookieBar = document.querySelector("[data-cookie-bar]");
const cookieAccept = document.querySelector("[data-cookie-accept]");
const COOKIE_KEY = "ww_franquias_consentimento";
if (cookieBar && !localStorage.getItem(COOKIE_KEY)) {
  cookieBar.hidden = false;
}
if (cookieAccept) {
  cookieAccept.addEventListener("click", () => {
    localStorage.setItem(COOKIE_KEY, "1");
    cookieBar.hidden = true;
  });
}

const yearEl = document.querySelector("[data-year]");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const leadForm = document.querySelector("[data-lead-form]");
const leadFeedback = document.querySelector("[data-lead-feedback]");
const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

function getFieldError(control) {
  if (control.type === "checkbox") {
    return control.checked ? "" : "É necessário aceitar para continuar.";
  }
  if (control.tagName === "SELECT") {
    return control.value ? "" : "Selecione uma opção.";
  }
  if (control.id === "telefone") {
    const digits = control.value.replace(/\D/g, "");
    if (!digits) return "Campo obrigatório.";
    if (digits.length < 10 || digits.length > 11) return "Informe um telefone válido com DDD.";
    return "";
  }
  if (!control.value.trim()) return "Campo obrigatório.";
  if (control.type === "email" && control.validity.typeMismatch) return "Digite um e-mail válido.";
  return "";
}

const leadFields = leadForm
  ? Array.from(leadForm.querySelectorAll(".field:not(.field--trap):not(.field--row)"))
      .map((wrap) => ({
        wrap,
        control: wrap.querySelector("input, select"),
        error: wrap.querySelector("[data-field-error]"),
      }))
      .filter((f) => f.control && f.error)
  : [];

function validateLeadField(field) {
  const message = getFieldError(field.control);
  field.wrap.classList.toggle("field--invalid", Boolean(message));
  field.error.textContent = message;
  return !message;
}

leadFields.forEach((field) => {
  const liveEvent = field.control.tagName === "SELECT" || field.control.type === "checkbox" ? "change" : "input";
  field.control.addEventListener(liveEvent, () => {
    if (field.wrap.classList.contains("field--invalid")) validateLeadField(field);
  });
  field.control.addEventListener("blur", () => validateLeadField(field));
});

if (leadForm) {
  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const invalidFields = leadFields.filter((field) => !validateLeadField(field));
    if (invalidFields.length) {
      invalidFields[0].control.focus();
      return;
    }

    const formData = new FormData(leadForm);
    if (formData.get("site")) {
      // honeypot preenchido: descarta silenciosamente, sem alertar o remetente automatizado
      leadForm.reset();
      return;
    }

    const payload = {
      nome: formData.get("nome"),
      email: formData.get("email"),
      telefone: formData.get("telefone"),
      cidade: formData.get("cidade"),
      uf: formData.get("uf"),
      capital_disponivel: formData.get("capital"),
      origem: "lp-franquias",
      pagina: window.location.href,
      enviado_em: new Date().toISOString(),
    };

    const submitButton = leadForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";
    leadFeedback.textContent = "";
    leadFeedback.removeAttribute("data-state");

    if (!WEBHOOK_URL) {
      console.warn("VITE_N8N_WEBHOOK_URL não configurada. Defina em um .env.local para conectar o formulário ao n8n.");
    }

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);

      leadForm.reset();
      leadFields.forEach((field) => {
        field.wrap.classList.remove("field--invalid");
        field.error.textContent = "";
      });
      leadFeedback.textContent = "Cadastro enviado com sucesso. Nossa equipe entrará em contato em breve.";
      leadFeedback.setAttribute("data-state", "success");
    } catch (error) {
      console.error("Falha ao enviar lead para o webhook do n8n:", error);
      leadFeedback.textContent = "Não foi possível enviar agora. Tente novamente em instantes ou fale conosco pelo WhatsApp.";
      leadFeedback.setAttribute("data-state", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Enviar meu cadastro";
    }
  });
}
