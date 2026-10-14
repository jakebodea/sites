/**
 * Interface strings that belong to code rather than content: site chrome,
 * the equity estimator, the renovation planner, and the application form.
 * Page copy lives in the CMS, one entry per locale. Spanish wording follows
 * the current site's own translations where it had them.
 */
import type { Locale } from "./locales.ts";

const en = {
  applyIntro: "A short set of questions to start your EquityFast request.",
  applyTitle: "Start your EquityFast request",
  close: "Close",
  emailLabel: "Email",
  equalHousing: "Equal Housing Opportunity",
  estimator: {
    below: "Below the $5K minimum line",
    cta: "Get My Real Numbers",
    homeValue: "Home value",
    line: "Estimated available line",
    mortgageBalance: "Mortgage balance",
    note: "Estimate only, based on borrowing up to 85% of your home's value across all liens. Soft credit check: no impact to your score.",
    within: "Within the $5K-$1M EquityFast range",
  },
  followUs: "Follow @equityfast",
  footerNav: "Footer",
  form: {
    amountHelp: "Between $5,000 and $1,000,000",
    amountLabel: "Amount you're seeking",
    back: "Back",
    city: "City",
    consent:
      "I consent to receiving updates, offers, and calls or texts from EquityFast and E Mortgage Capital at the contact info above.",
    continue: "Continue",
    disclaimer:
      "This is not a commitment to lend. Submitting starts a soft credit review only.",
    doneHome: "Back to Home",
    errorGeneric: "We couldn't send that. Please try again.",
    errorInvalid:
      "Please complete the highlighted fields with valid information.",
    firstName: "First name",
    lastName: "Last name",
    middleName: "Middle name",
    no: "No",
    optional: "optional",
    phoneLabel: "Phone number",
    saves: "Your answers save on this device as you go.",
    security: "Quick security check so we know you're human.",
    sending: "Sending…",
    state: "State",
    steps: {
      amount: {
        sub: "EquityFast lines run from $5,000 to $1,000,000.",
        title: "How much money are you seeking?",
      },
      contact: { title: "How can we reach you?" },
      forSale: { title: "Is the property currently listed for sale?" },
      name: {
        sub: "Please enter your full legal name as it appears on your ID.",
        title: "What's your name?",
      },
      occupancy: { title: "How is this property used?" },
      ownership: { title: "How is the property owned?" },
      primaryAddress: { title: "What's your primary residence address?" },
      propertyAddress: { title: "What's the address of the property?" },
    },
    street: "Street address",
    submit: "Submit My Request",
    successBody:
      "We have everything we need to get started. An EquityFast specialist will reach out personally to walk you through your options. No obligation, no pressure.",
    successNote: "Most homeowners hear from us the same business day.",
    successTitle: "Thanks",
    successTitleAnonymous: "Thanks for reaching out.",
    turnstileFailed:
      "The security check could not load. Please refresh the page.",
    yes: "Yes",
    zip: "ZIP code",
  },
  language: "Language",
  mainNav: "Main",
  menu: "Menu",
  options: {
    forSale: { No: "No", Yes: "Yes" },
    occupancy: {
      "Investment property": "Investment property",
      "Primary residence": "Primary residence",
      "Secondary home": "Secondary home",
    },
    ownership: {
      "Joint owner": "Joint owner",
      LLC: "LLC",
      "Sole owner": "Sole owner",
      Trust: "Trust",
    },
  },
  planner: {
    aboveCost: "Above cost",
    blended: "Blended return",
    budgetAmountFor: "Budget amount for",
    budgetFor: "Budget for",
    count: "Projects selected",
    cta: "Fund This With A HELOC",
    drag: "Drag to set your budget",
    equityAdded: "Equity added",
    gained: "Estimated equity gained",
    pick: "Pick projects & set budgets",
    pickHelp: "Tap a project to add it; the budget slider opens right below.",
    remove: "Remove from plan",
    reset: "Reset plan",
    selectedSummary: "Budget {budget} · +{gain} equity",
    spent: "Spent",
    total: "Total budget",
    valueAbove: "Value above cost",
  },
  poweredBy: "Powered by",
  rights: "All rights reserved.",
  skipToContent: "Skip to content",
  startNow: "Start Now",
  switchTo: "Español",
};

export type UiStrings = typeof en;

const es: UiStrings = {
  applyIntro: "Unas preguntas breves para iniciar su solicitud EquityFast.",
  applyTitle: "Inicie su solicitud EquityFast",
  close: "Cerrar",
  emailLabel: "Correo electrónico",
  equalHousing: "Igualdad de Oportunidades en la Vivienda",
  estimator: {
    below: "Por debajo del mínimo de $5K",
    cta: "Ver Mis Números Reales",
    homeValue: "Valor de la vivienda",
    line: "Línea disponible estimada",
    mortgageBalance: "Saldo hipotecario",
    note: "Solo una estimación, basada en financiar hasta el 85% del valor de su vivienda sumando todos los gravámenes. Consulta de crédito suave: sin impacto en su puntaje.",
    within: "Dentro del rango de $5K-$1M de EquityFast",
  },
  followUs: "Síganos @equityfast",
  footerNav: "Pie de página",
  form: {
    amountHelp: "Entre $5,000 y $1,000,000",
    amountLabel: "Monto que busca",
    back: "Atrás",
    city: "Ciudad",
    consent:
      "Doy mi consentimiento para recibir actualizaciones, ofertas y llamadas o mensajes de EquityFast y E Mortgage Capital en los datos de contacto anteriores.",
    continue: "Continuar",
    disclaimer:
      "Esto no es un compromiso de préstamo. Enviar solo inicia una revisión de crédito suave.",
    doneHome: "Volver al Inicio",
    errorGeneric: "No pudimos enviarlo. Inténtelo de nuevo.",
    errorInvalid: "Complete los campos resaltados con información válida.",
    firstName: "Nombre",
    lastName: "Apellido",
    middleName: "Segundo nombre",
    no: "No",
    optional: "opcional",
    phoneLabel: "Número de teléfono",
    saves: "Sus respuestas se guardan en este dispositivo mientras avanza.",
    security:
      "Verificación rápida de seguridad para confirmar que es una persona.",
    sending: "Enviando…",
    state: "Estado",
    steps: {
      amount: {
        sub: "Las líneas EquityFast van de $5,000 a $1,000,000.",
        title: "¿Cuánto dinero está buscando?",
      },
      contact: { title: "¿Cómo podemos contactarle?" },
      forSale: { title: "¿La propiedad está actualmente en venta?" },
      name: {
        sub: "Ingrese su nombre legal completo tal como aparece en su identificación.",
        title: "¿Cuál es su nombre?",
      },
      occupancy: { title: "¿Cómo se usa esta propiedad?" },
      ownership: { title: "¿Cómo es la titularidad de la propiedad?" },
      primaryAddress: {
        title: "¿Cuál es la dirección de su residencia principal?",
      },
      propertyAddress: { title: "¿Cuál es la dirección de la propiedad?" },
    },
    street: "Dirección",
    submit: "Enviar Mi Solicitud",
    successBody:
      "Tenemos todo lo necesario para comenzar. Un especialista de EquityFast se comunicará personalmente para explicarle sus opciones. Sin compromiso, sin presión.",
    successNote:
      "La mayoría de los propietarios recibe noticias nuestras el mismo día hábil.",
    successTitle: "Gracias",
    successTitleAnonymous: "Gracias por contactarnos.",
    turnstileFailed:
      "La verificación de seguridad no pudo cargar. Actualice la página.",
    yes: "Sí",
    zip: "Código postal",
  },
  language: "Idioma",
  mainNav: "Principal",
  menu: "Menú",
  options: {
    forSale: { No: "No", Yes: "Sí" },
    occupancy: {
      "Investment property": "Propiedad de inversión",
      "Primary residence": "Residencia principal",
      "Secondary home": "Vivienda secundaria",
    },
    ownership: {
      "Joint owner": "Copropietario",
      LLC: "LLC",
      "Sole owner": "Propietario único",
      Trust: "Fideicomiso",
    },
  },
  planner: {
    aboveCost: "Sobre el costo",
    blended: "Retorno combinado",
    budgetAmountFor: "Monto del presupuesto para",
    budgetFor: "Presupuesto para",
    count: "Proyectos seleccionados",
    cta: "Financiar Esto Con Un HELOC",
    drag: "Deslice para fijar su presupuesto",
    equityAdded: "Equidad añadida",
    gained: "Equidad estimada ganada",
    pick: "Elija proyectos y presupuestos",
    pickHelp:
      "Toque un proyecto para agregarlo; el control de presupuesto se abre debajo.",
    remove: "Quitar del plan",
    reset: "Reiniciar plan",
    selectedSummary: "Presupuesto {budget} · +{gain} de equidad",
    spent: "Invertido",
    total: "Presupuesto total",
    valueAbove: "Valor sobre el costo",
  },
  poweredBy: "Impulsado por",
  rights: "Todos los derechos reservados.",
  skipToContent: "Ir al contenido",
  startNow: "Comenzar",
  switchTo: "English",
};

const strings: Record<Locale, UiStrings> = { en, es };

export const ui = (locale: Locale): UiStrings => strings[locale];
