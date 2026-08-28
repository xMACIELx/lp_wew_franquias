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
const CAPI_WEBHOOK_URL = import.meta.env.VITE_N8N_CAPI_WEBHOOK_URL;

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

function buildWhatsappUrl(nome) {
  const phone = document.body.dataset.whatsappPhone;
  const text = `Olá! Me chamo ${nome} e quero saber mais sobre a franquia W&W Assessoria.`;
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;
}

function generateEventId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  // fallback para navegadores/contextos sem crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

// Todo formulario de lead do site segue o mesmo fluxo: valida, dispara o evento
// Lead do Meta Pixel, abre o WhatsApp (dentro do proprio clique, senao o navegador
// pode bloquear como pop-up) e manda os dados pro webhook do n8n em paralelo, sem
// esperar a resposta pra redirecionar.
function setupLeadForm(form, feedback, { honeypotName, formId, origem, buildPayload }) {
  if (!form || !feedback) return;
  const validator = createFieldValidator(form);

  form.addEventListener("submit", (event) => {
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

    const eventId = generateEventId();

    if (typeof window.fbq === "function") {
      window.fbq("track", "Lead", {}, { eventID: eventId });
    }

    window.open(buildWhatsappUrl(formData.get("nome")), "_blank", "noopener");

    const payload = {
      ...buildPayload(formData),
      form_id: formId,
      origem,
      pagina: window.location.href,
      enviado_em: new Date().toISOString(),
    };

    if (WEBHOOK_URL) {
      fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((error) => {
        console.warn(`Falha ao enviar lead (${formId}) para o webhook do n8n:`, error);
      });
    } else {
      console.warn("VITE_N8N_WEBHOOK_URL não configurada. Defina em um .env.local para conectar o formulário ao n8n.");
    }

    // POST separado, dedicado ao workflow do n8n que repassa o evento pro Meta
    // Conversions API - usa o mesmo event_id do fbq acima pra permitir deduplicacao.
    const capiPayload = {
      nome: formData.get("nome"),
      telefone: formData.get("telefone"),
      email: formData.get("email"),
      event_id: eventId,
      event_source_url: window.location.href,
      fbp: getCookie("_fbp"),
      fbc: getCookie("_fbc"),
    };

    if (CAPI_WEBHOOK_URL) {
      fetch(CAPI_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capiPayload),
      }).catch((error) => {
        console.warn(`Falha ao enviar evento CAPI (${formId}) para o webhook do n8n:`, error);
      });
    } else {
      console.warn("VITE_N8N_CAPI_WEBHOOK_URL não configurada. Defina em um .env.local para conectar o evento do Meta ao n8n.");
    }

    form.reset();
    validator.clearAll();
    feedback.textContent = "Perfeito! Vamos continuar no WhatsApp.";
    feedback.setAttribute("data-state", "success");
  });
}

setupLeadForm(document.querySelector("[data-lead-form]"), document.querySelector("[data-lead-feedback]"), {
  honeypotName: "site",
  formId: "principal",
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

document.querySelectorAll("[data-mini-lead-form]").forEach((form) => {
  setupLeadForm(form, form.querySelector("[data-mini-lead-feedback]"), {
    honeypotName: "site_mini",
    formId: form.dataset.formId,
    origem: "lp-franquias-mini",
    buildPayload: (formData) => ({
      nome: formData.get("nome"),
      telefone: formData.get("telefone"),
      email: formData.get("email"),
    }),
  });
});
