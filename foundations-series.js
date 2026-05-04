(function () {
  const hub = {
    title: "Foundations: A Five-Part Field Series on Applied AI",
    eyebrow: "FAA Field Series",
    description: [
      "Most AI conversations start with tools. This series starts with the business.",
      "Foundations is FAA’s five-part field series for mid-market operators evaluating applied AI. Each brief covers one operating layer that must be in place before AI can create leverage: data, process, architecture, ROI sequencing, and governance.",
      "Written from inside the operating business — not the vendor stack."
    ],
    primary: { label: "Read the Series", href: "insights-foundations-data-constraint.html" },
    secondary: { label: "Schedule an AI Readiness Working Session", href: "contact.html#contact-options" }
  };

  const articles = [
    {
      key: "foundations-data-constraint",
      part: 1,
      title: "Data: The Constraint You Can’t Outrun",
      category: "Data Curation & Governance",
      image: "assets/insights/foundations-series-01-data-foundation.png",
      subhead: "AI does not fail because models are wrong. It fails because the data underneath it never agreed.",
      pull: "AI does not fix data problems. It makes them operationally unavoidable.",
      operator: "Before AI can support decisions, the business has to know which data source wins, who owns it, and how changes are controlled. The goal is not perfect data. The goal is usable, governed, consistent data that the business can trust.",
      diagnosticCta: "See Where Your Foundation Breaks",
      cta: "Map Your Data Foundation",
      body: [
        "Every AI system depends on inputs.",
        "In most mid-market environments, those inputs are inconsistent across systems, incomplete at the field level, manually adjusted without traceability, and owned by no one.",
        "The result is not bad AI.",
        "It is unpredictable outputs.",
        "Your data likely lives in ERP, CRM, spreadsheets, email threads, and informal workarounds. Each holds a version of truth. None hold the truth.",
        "That is where AI breaks.",
        "When data is not aligned, forecasts diverge from reporting. Pricing logic conflicts across teams. Automation creates exceptions instead of efficiency. AI outputs are questioned instead of used.",
        "Trust erodes quickly.",
        "Before applying AI, operators need one system of record per critical dataset, defined ownership, enforced input rules, and consistent structure.",
        "Not perfection.",
        "Consistency.",
        "AI will amplify whatever you give it. If your data is fragmented, it will scale fragmentation. If your data is structured, it will scale clarity."
      ],
      diagnostic: [
        "No single system of record for critical datasets",
        "Ownership is unclear across functions",
        "Manual spreadsheet overrides change the answer after the fact",
        "No lineage into reports, dashboards, or AI outputs",
        "Teams rely on different versions of the truth"
      ]
    },
    {
      key: "foundations-process-before-ai",
      part: 2,
      title: "Process: Fix the System Before You Accelerate It",
      category: "Workflow Optimization",
      image: "assets/insights/foundations-series-process-pathway.png",
      subhead: "Automating a broken process does not fix it. It makes it fail faster.",
      pull: "A bad process with AI is still a bad process — just faster, louder, and harder to unwind.",
      operator: "AI should not be used to hide process weakness. It should be applied after the workflow is visible, repeatable, and controlled. If humans cannot explain the decision path, automation will not make it stronger.",
      diagnosticCta: "See Where Your Workflow Breaks",
      cta: "Evaluate Your Workflow Readiness",
      body: [
        "Most processes are not designed.",
        "They evolve.",
        "Over time, they accumulate exceptions, workarounds, manual overrides, and dependency on specific individuals.",
        "What looks like a process is often a set of loosely connected actions held together by experience and effort.",
        "That may work with humans.",
        "It does not work with automation.",
        "The mistake is trying to map inputs, define outputs, and insert AI before understanding how the work actually happens under pressure.",
        "In reality, approvals rarely follow a clean path. Data arrives incomplete. Teams interpret rules differently. Decisions rely on context that is not captured in systems.",
        "AI cannot navigate undefined behavior.",
        "Before automation, the process has to become observable, repeatable, and controllable.",
        "Decision points need to be defined. Exceptions need to be categorized. Handoffs need to be visible. Variability needs to be understood.",
        "AI does not create structure.",
        "It depends on it.",
        "Fix the process first. Then accelerate it."
      ],
      diagnostic: [
        "The documented process does not match how work actually happens",
        "Approvals depend on tribal knowledge",
        "Exceptions are handled manually and inconsistently",
        "Handoffs between teams are invisible",
        "Automation is applied before decision rules are defined"
      ]
    },
    {
      key: "foundations-ai-architecture",
      part: 3,
      title: "Architecture: The System Behind the System",
      category: "Applied AI",
      image: "assets/insights/foundations-series-03-system-architecture.png",
      subhead: "Most companies do not have a system problem. They have a system interaction problem.",
      pull: "AI cannot compensate for architecture no one understands.",
      operator: "The issue is rarely one bad system. The issue is how systems interact. Before AI is deployed, the business needs to understand where data moves, where logic changes, and where manual cleanup enters the process.",
      diagnosticCta: "Review Your System Architecture",
      cta: "Review Your System Architecture",
      body: [
        "Your business does not run on one system.",
        "It runs across ERP, CRM, operational tools, spreadsheets, shared drives, email, and external data sources.",
        "The problem is not that these systems exist.",
        "The problem is that they interact poorly.",
        "Data moves between them inconsistently. Logic gets recreated in spreadsheets. Definitions change from one function to another. Reports reconcile only after manual cleanup.",
        "Then AI gets placed on top of it.",
        "If the architecture is unclear, data flows are inconsistent, transformations are undocumented, and dependencies are hidden.",
        "AI does not unify that environment.",
        "It exposes it.",
        "The wrong response is to replace everything, centralize everything immediately, or over-engineer architecture before the business case is clear.",
        "What actually works is simpler.",
        "Define system roles. Map data flows. Identify transformation points. Control integration boundaries.",
        "Architecture is not about tools.",
        "It is about how systems interact.",
        "If you do not understand the system behind the system, AI will not fix it."
      ],
      diagnostic: [
        "ERP, CRM, spreadsheets, and operational systems do not share definitions",
        "Data transformations are undocumented",
        "Business logic is recreated in spreadsheets",
        "Integration boundaries are unclear",
        "Reports reconcile only after manual cleanup"
      ]
    },
    {
      key: "foundations-ai-roi-sequencing",
      part: 4,
      title: "ROI Sequencing: Where AI Actually Creates Value",
      category: "Applied AI",
      image: "assets/insights/foundations-series-04-roi-sequencing.png",
      subhead: "AI does not create value everywhere at once. It creates value where conditions are already aligned.",
      pull: "The best first AI use case is rarely the flashiest. It is the one the business is ready to absorb.",
      operator: "The first AI use case should build confidence, not create organizational drag. Start where the conditions are ready: cleaner inputs, clearer outputs, tighter process boundaries, and measurable value.",
      diagnosticCta: "Prioritize Your AI Use Cases",
      cta: "Prioritize Your AI Use Cases",
      body: [
        "Most companies ask the wrong first question.",
        "They ask: where can we apply AI?",
        "The better question is: where will AI actually work?",
        "AI delivers ROI where data is relatively clean, processes are consistent, decisions are repeatable, and outputs are measurable.",
        "That is usually not the most complex part of the business.",
        "It is usually the most ready.",
        "Starting with high-visibility, cross-functional, strategically loaded initiatives often creates unnecessary risk. These efforts are hard to scope, hard to measure, and easy to derail.",
        "The better path is controlled sequencing.",
        "Start where inputs are stable. Start where outputs are clear. Start where variability is limited. Start where value can be measured.",
        "Then build trust.",
        "A strong first use case creates operational confidence. It teaches the organization how to work with AI. It reveals what needs to be fixed before scaling.",
        "That is how AI moves from experiment to operating capability.",
        "AI ROI is not about scale first.",
        "It is about sequencing correctly."
      ],
      diagnostic: [
        "The first use case is chosen for visibility instead of readiness",
        "Inputs are unstable or poorly governed",
        "Outputs are not measurable",
        "The process has too much variation for a first deployment",
        "Leadership tries to scale before trust is built"
      ]
    },
    {
      key: "foundations-ai-governance",
      part: 5,
      title: "Governance: The System That Holds It Together",
      category: "Data Curation & Governance",
      image: "assets/insights/foundations-series-05-governance-system.png",
      subhead: "Without governance, every improvement degrades over time.",
      pull: "Governance is not overhead. It is how you keep AI from turning operational noise into operational risk.",
      operator: "Governance is not a policy binder. It is the operating system for accountability. Without it, AI increases speed but reduces control.",
      diagnosticCta: "Build Your AI Governance Model",
      cta: "Build Your AI Governance Model",
      body: [
        "Most companies treat governance as policy.",
        "That is too narrow.",
        "In operations, governance is control over how the system behaves.",
        "It defines who owns data. Who approves changes. Who resolves conflicts. Who validates outputs. Who is accountable when automated decisions affect the business.",
        "Without governance, data degrades. Processes drift. Ownership becomes unclear. Exceptions multiply.",
        "Even well-designed systems collapse.",
        "AI raises the stakes because it introduces speed, scale, and amplification.",
        "Without governance, errors scale faster. Inconsistencies multiply. Accountability disappears into the system.",
        "Good governance is not bureaucracy.",
        "It is operating discipline.",
        "It means dataset ownership is clear. Input rules are enforced. Changes are controlled. Decisions are traceable. System boundaries are understood.",
        "Governance is not the last step.",
        "It is the condition that allows everything else to hold."
      ],
      diagnostic: [
        "No one owns the critical data after implementation",
        "Process changes happen without control",
        "AI outputs are used without validation rules",
        "Exceptions multiply without accountability",
        "Governance is treated as policy instead of operating discipline"
      ]
    }
  ];

  const pageMap = new Map(articles.map((article) => [article.key, article]));
  const root = document.querySelector("[data-foundations-page]");
  if (!root) return;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function articleHref(article) {
    return "insights-" + article.key + ".html";
  }

  function renderHub() {
    document.title = hub.title + " — Foundation AI Advisory";
    root.innerHTML = `
      <section class="foundations-hub-hero">
        <div class="container-faa foundations-hub-grid">
          <div>
            <div class="eyebrow">${esc(hub.eyebrow)}</div>
            <h1 class="foundations-h1">${esc(hub.title)}</h1>
            ${hub.description.map((item) => `<p class="foundations-lede">${esc(item)}</p>`).join("")}
            <div class="foundations-actions">
              <a href="${hub.primary.href}" class="btn btn-primary">${esc(hub.primary.label)}</a>
              <a href="${hub.secondary.href}" class="btn btn-outline-white">${esc(hub.secondary.label)}</a>
            </div>
          </div>
          <div class="foundations-hub-panel" aria-label="Series structure">
            <span>Five operating layers</span>
            <strong>Data → Process → Architecture → ROI → Governance</strong>
          </div>
        </div>
      </section>
      <section class="bg-white">
        <div class="container-faa section-y">
          <div class="foundations-card-grid">
            ${articles.map((article) => `
              <a class="foundations-series-card" href="${articleHref(article)}">
                <span>Part ${article.part} of 5</span>
                <small>${esc(article.category)}</small>
                <h2>${esc(article.title)}</h2>
                <p>${esc(article.subhead)}</p>
                <strong>Read brief →</strong>
              </a>
            `).join("")}
          </div>
        </div>
      </section>
      ${renderFinalCta(false)}
    `;
  }

  function navFor(article) {
    const index = articles.indexOf(article);
    const previous = index === 0 ? null : articles[index - 1];
    const next = index === articles.length - 1 ? null : articles[index + 1];
    return `
      <nav class="foundations-series-nav" aria-label="Foundations series navigation">
        <a href="${previous ? articleHref(previous) : "insights-foundations-applied-ai-series.html"}">
          <span>${previous ? "Previous Brief" : "Back to Series"}</span>
          <strong>${esc(previous ? previous.title : hub.title)}</strong>
        </a>
        <a href="${next ? articleHref(next) : "insights-foundations-applied-ai-series.html"}">
          <span>${next ? "Next Brief" : "Back to Series"}</span>
          <strong>${esc(next ? next.title : "Explore the Full Foundations Series")}</strong>
        </a>
      </nav>
    `;
  }

  function renderFinalCta(isFinal) {
    return `
      <section class="foundations-final-cta">
        <div class="container-faa">
          <div class="foundations-cta-inner">
            <div>
              <span class="eyebrow">${isFinal ? "Final Step" : "AI Foundation Readiness Review"}</span>
              <h2>${isFinal ? "Ready to apply AI without scaling chaos?" : "AI Foundation Readiness Review"}</h2>
              <p>${isFinal ? "FAA helps mid-market operators evaluate data, process, architecture, sequencing, and governance before AI is deployed. The goal is not more tools. The goal is a business foundation AI can actually use." : "In 30 minutes, we’ll identify where your AI foundation is strongest, where it is exposed, and which use cases are worth pursuing first."}</p>
            </div>
            <div class="foundations-actions">
              <a href="contact.html#contact-options" class="btn btn-on-blue">Start with a Business Systems Assessment</a>
              ${isFinal ? '<a href="index.html#methodology" class="btn btn-outline-white">Explore the FAA Methodology</a>' : ""}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderArticle(article) {
    document.title = article.title + " — Foundation AI Advisory";
    root.innerHTML = `
      <section class="foundations-article-hero">
        <div class="container-faa">
          <a href="insights-foundations-applied-ai-series.html" class="read-link">Back to Series</a>
          <div class="foundations-meta">
            <span>Field Series</span>
            <span>Part ${article.part} of 5</span>
            <span>${esc(article.category)}</span>
          </div>
          <h1 class="foundations-h1">${esc(article.title)}</h1>
          <p class="foundations-article-subhead">${esc(article.subhead)}</p>
        </div>
      </section>
      <section class="bg-white">
        <div class="container-faa foundations-article-layout">
          <figure class="foundations-hero-image">
            <img src="${esc(article.image)}" alt="${esc(article.title)}" onerror="this.closest('figure').classList.add('is-missing'); this.remove();" />
          </figure>
          <article class="foundations-body">
            ${article.body.slice(0, 5).map((item) => `<p>${esc(item)}</p>`).join("")}
            <blockquote>${esc(article.pull)}</blockquote>
            ${article.body.slice(5).map((item) => `<p>${esc(item)}</p>`).join("")}
            <aside class="foundations-operator-box">
              <h2>What this means for operators</h2>
              <p>${esc(article.operator)}</p>
            </aside>
            <aside class="foundations-diagnostic">
              <h2>Where this usually breaks</h2>
              <ul>${article.diagnostic.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
              <a href="contact.html#contact-options" class="read-link">${esc(article.diagnosticCta)} →</a>
            </aside>
            <div class="foundations-article-cta">
              <a href="contact.html#contact-options" class="btn btn-primary">${esc(article.cta)}</a>
            </div>
            ${navFor(article)}
          </article>
        </div>
      </section>
      ${renderFinalCta(article.part === 5)}
    `;
  }

  const page = root.getAttribute("data-foundations-page");
  if (page === "hub") {
    renderHub();
    return;
  }
  const article = pageMap.get(page);
  if (article) renderArticle(article);
})();
