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

document.querySelectorAll('[data-mask="phone"]').forEach((phoneInput) => {
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
});

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

const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

function getFieldError(control) {
  if (control.type === "checkbox") {
    return control.checked ? "" : "É necessário aceitar para continuar.";
  }
  if (control.tagName === "SELECT") {
    return control.value ? "" : "Selecione uma opção.";
  }
  if (control.dataset.mask === "phone") {
    const digits = control.value.replace(/\D/g, "");
    if (!digits) return "Campo obrigatório.";
    if (digits.length < 10 || digits.length > 11) return "Informe um telefone válido com DDD.";
    return "";
  }
  if (!control.value.trim()) return "Campo obrigatório.";
  if (control.type === "email" && control.validity.typeMismatch) return "Digite um e-mail válido.";
  return "";
}

function createFieldValidator(form) {
  const fields = Array.from(form.querySelectorAll(".field:not(.field--trap):not(.field--row)"))
    .map((wrap) => ({
      wrap,
      control: wrap.querySelector("input, select"),
      error: wrap.querySelector("[data-field-error]"),
    }))
    .filter((f) => f.control && f.error);

  function validate(field) {
    const message = getFieldError(field.control);
    field.wrap.classList.toggle("field--invalid", Boolean(message));
    field.error.textContent = message;
    return !message;
  }

  fields.forEach((field) => {
    const liveEvent = field.control.tagName === "SELECT" || field.control.type === "checkbox" ? "change" : "input";
    field.control.addEventListener(liveEvent, () => {
      if (field.wrap.classList.contains("field--invalid")) validate(field);
    });
    field.control.addEventListener("blur", () => validate(field));
  });

  return {
    validateAll: () => fields.filter((field) => !validate(field)),
    clearAll: () => fields.forEach((field) => {
      field.wrap.classList.remove("field--invalid");
      field.error.textContent = "";
    }),
  };
}

function setupLeadForm(form, feedback, { honeypotName, origem, buildPayload }) {
  if (!form || !feedback) return;
  const validator = createFieldValidator(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const invalidFields = validator.validateAll();
    if (invalidFields.length) {
      invalidFields[0].control.focus();
      return;
    }

    const formData = new FormData(form);
    if (formData.get(honeypotName)) {
      // honeypot preenchido: descarta silenciosamente, sem alertar o remetente automatizado
      form.reset();
      return;
    }

    const payload = {
      ...buildPayload(formData),
      origem,
      pagina: window.location.href,
      enviado_em: new Date().toISOString(),
    };

    const submitButton = form.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";
    feedback.textContent = "";
    feedback.removeAttribute("data-state");

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

      form.reset();
      validator.clearAll();
      feedback.textContent = "Cadastro enviado com sucesso. Nossa equipe entrará em contato em breve.";
      feedback.setAttribute("data-state", "success");
    } catch (error) {
      console.error(`Falha ao enviar lead (${origem}) para o webhook do n8n:`, error);
      feedback.textContent = "Não foi possível enviar agora. Tente novamente em instantes ou fale conosco pelo WhatsApp.";
      feedback.setAttribute("data-state", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
}

setupLeadForm(document.querySelector("[data-lead-form]"), document.querySelector("[data-lead-feedback]"), {
  honeypotName: "site",
  origem: "lp-franquias",
  buildPayload: (formData) => ({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    cidade: formData.get("cidade"),
    uf: formData.get("uf"),
    capital_disponivel: formData.get("capital"),
  }),
});

setupLeadForm(document.querySelector("[data-mini-lead-form]"), document.querySelector("[data-mini-lead-feedback]"), {
  honeypotName: "site_mini",
  origem: "lp-franquias-mini",
  buildPayload: (formData) => ({
    nome: formData.get("nome"),
    telefone: formData.get("telefone"),
  }),
});
