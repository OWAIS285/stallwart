// Family drills: create an invitation, list drills, and read a drill report.

import { api } from "../api.js";
import { backLink, emptyState, errorState, pageHeader, skeletons, strainCard } from "../components.js";
import { copyText, fmtDate, h, icon, observeReveal, scamLabel, toast } from "../util.js";

export const inviteLink = (drillId, key) => `${location.origin}${location.pathname}#/join/${drillId}/${key}`;

const OUTCOME = {
  passed: { label: "Passed", cls: "ok", text: "stopped at the payment step and did not share anything." },
  failed: { label: "Needs practice", cls: "bad", text: "shared sensitive details during the practice call." },
  aborted: { label: "Ended early", cls: "warn", text: "left the call before the practice finished." },
};

function outcomeChip(drill) {
  const info = OUTCOME[drill.outcome];
  if (info) return h("span", { class: `badge ${info.cls}` }, info.label);
  return h("span", { class: "badge" }, "Waiting for the call");
}

// Two made-up drills, shown to everyone, so a first-time visitor sees what the list and a report look like.
const EXAMPLE_DRILLS = [
  {
    drillId: "example-kamala",
    example: true,
    parentName: "Kamala Iyer",
    familyName: "The Iyer family",
    strainId: "demo_bank_kyc_block",
    createdAt: "2026-10-15T10:20:00Z",
    outcome: "passed",
    stepsTotal: 4,
    stoppedAtStep: 3,
    debriefText:
      "Well done, Kamala ji. You stopped the moment the caller asked for the OTP, and that is exactly right: a bank never asks for an OTP on a call. Remember three things. Hang up. Call your bank on the number printed on your card. Tell your family before you do anything else.",
  },
  {
    drillId: "example-mohan",
    example: true,
    parentName: "Mohan Lal Gupta",
    familyName: "The Gupta family",
    strainId: "demo_digital_arrest",
    createdAt: "2026-10-17T18:05:00Z",
    outcome: "failed",
    stepsTotal: 4,
    stoppedAtStep: 2,
    debriefText:
      "Mohan ji, this is only practice, and nothing real was shared. The caller frightened you with an arrest warrant, told you to stay on the line and keep it secret, and then you read out your Aadhaar details. That is how this scam works: fear first, then secrecy, then payment. No officer ever arrests anyone over the phone. If it happens for real, hang up and call your son or daughter first. Let us practise once more.",
  },
];

export function DrillNewView({ strainId }) {
  const el = h("div", { class: "page narrow" }, pageHeader("Create a family drill", "A short practice call that teaches a parent how this scam sounds."), skeletons(1));

  async function load() {
    let strains;
    try {
      ({ strains } = await api.strains());
    } catch (err) {
      el.replaceChildren(pageHeader("Create a family drill"), errorState(err.message, load));
      return;
    }
    if (!strains.length) {
      el.replaceChildren(pageHeader("Create a family drill"), emptyState({ iconName: "virus", title: "No strain to practise yet", text: "A drill is built from a scam strain. Capture one first.", action: h("a", { class: "btn primary", href: "#/call" }, "Take a live call") }));
      return;
    }
    renderForm(strains);
  }

  function renderForm(strains) {
    const select = h("select", { class: "input", id: "strain", "aria-label": "Strain" }, strains.map((s) => h("option", { value: s.strainId, selected: s.strainId === strainId }, `${scamLabel(s.scamType)}${s.demo ? " (example)" : ""}${s.impersonatedEntity ? ` · ${s.impersonatedEntity}` : ""}`)));
    const preview = h("div", { class: "slot" });
    const paintPreview = () => preview.replaceChildren(strainCard(strains.find((s) => s.strainId === select.value) || strains[0], { compact: true }));
    select.addEventListener("change", paintPreview);
    paintPreview();

    const parentName = h("input", { class: "input", id: "pname", type: "text", maxlength: "60", required: true, placeholder: "e.g. Savitri Devi", autocomplete: "off" });
    const title = h("select", { class: "input", id: "ptitle" }, [h("option", { value: "mother" }, "Mother (Amma)"), h("option", { value: "father" }, "Father (Papa)"), h("option", { value: "elder" }, "Another elder (Ji)")]);
    const family = h("input", { class: "input", id: "fname", type: "text", maxlength: "60", required: true, placeholder: "e.g. The Sharma family", autocomplete: "off" });
    const consent = h("input", { id: "consent", type: "checkbox", required: true });
    const submit = h("button", { class: "btn primary lg", type: "submit" }, icon("users"), "Create the invitation");
    const field = (label, control, hint) => h("div", { class: "field" }, h("label", { for: control.id }, label), control, hint ? h("small", { class: "muted" }, hint) : null);

    const form = h(
      "form",
      { class: "card form", onSubmit: submitForm },
      field("Scam to practise", select),
      preview,
      field("Their name", parentName, "Used only so the actor can address them politely."),
      field("How you address them", title),
      field("Your family name", family, "Shown to them on the invitation so they know it is from you."),
      h("label", { class: "consent", for: "consent" }, consent, h("span", {}, "I have asked this person and they agree to take a short practice call. I understand it is a made-up scam script, nothing real will be asked of them, and the call stops at the first sign of risk.")),
      submit,
    );
    el.replaceChildren(pageHeader("Create a family drill", "A short practice call that teaches a parent how this scam sounds."), form);
    observeReveal(el);

    async function submitForm(event) {
      event.preventDefault();
      submit.disabled = true;
      try {
        const result = await api.createDrill({ strainId: select.value, parentName: parentName.value.trim(), parentTitle: title.value, familyName: family.value.trim(), consent: consent.checked });
        renderDone(result, parentName.value.trim());
      } catch (err) {
        toast(err.message, "error");
        submit.disabled = false;
      }
    }
  }

  function renderDone({ drillId, shareKey }, name) {
    const link = inviteLink(drillId, shareKey);
    const message = `Namaste ${name}, I have set up a short practice phone call so you can see how scammers talk. Nothing real will be asked. Please open this link when you are free: ${link}`;
    el.replaceChildren(
      pageHeader("Invitation ready", `Send this link to ${name}. They tap it, pick up, and the practice call begins.`),
      h(
        "section",
        { class: "card done rise" },
        h("div", { class: "done-i" }, icon("check")),
        h("div", { class: "linkbox" }, h("code", {}, link)),
        h(
          "div",
          { class: "cta-row" },
          h("button", { class: "btn primary", type: "button", onClick: () => copyText(link) }, icon("copy"), "Copy the link"),
          h("a", { class: "btn", href: `https://wa.me/?text=${encodeURIComponent(message)}`, target: "_blank", rel: "noopener noreferrer" }, icon("send"), "Share on WhatsApp"),
          h("a", { class: "btn ghost", href: `#/drill/${drillId}` }, "See the drill report"),
        ),
        h("p", { class: "fineprint" }, icon("lock"), "Only people with this link can start the drill. It works on a phone and uses the microphone."),
      ),
    );
  }

  load();
  return { el };
}

export function DrillsView() {
  const el = h("div", { class: "page" }, pageHeader("Family drills", "Practice calls you have sent to parents and elders."), skeletons(2));

  async function load() {
    let drills;
    try {
      ({ drills } = await api.drills());
    } catch (err) {
      el.replaceChildren(pageHeader("Family drills"), errorState(err.message, load));
      return;
    }
    const header = pageHeader("Family drills", "Practice calls you have sent to parents and elders.", h("a", { class: "btn primary", href: "#/strains" }, icon("users"), "New drill"));
    const card = (drill) =>
      h(
        "a",
        { class: "card call-card reveal", href: `#/drill/${drill.drillId}` },
        h("div", { class: "cc-top" }, h("span", { class: "cc-icon" }, icon("users")), h("div", {}, h("h3", {}, drill.parentName), h("small", { class: "muted" }, `${drill.familyName} \u00b7 ${fmtDate(drill.createdAt)}`)), h("span", { class: "grow" }), outcomeChip(drill)),
        drill.outcome && drill.stepsTotal ? h("p", { class: "muted" }, `Stopped at step ${drill.stoppedAtStep} of ${drill.stepsTotal}`) : h("p", { class: "muted" }, "Not started yet. Share the invitation link."),
      );
    const examples = h(
      "div",
      { class: "section-gap" },
      h("h2", { class: "sub-h reveal" }, "Example drills"),
      h("p", { class: "muted" }, "Two made-up drills, to show what a finished practice call looks like."),
      h("div", { class: "grid cards" }, EXAMPLE_DRILLS.map(card)),
    );
    if (!drills.length) {
      el.replaceChildren(header, emptyState({ iconName: "users", title: "No drills of your own yet", text: "Open a strain and press \u201cCreate a family drill\u201d to send a consented practice call.", action: h("a", { class: "btn primary", href: "#/strains" }, "Browse strains") }), examples);
      observeReveal(el);
      return;
    }
    el.replaceChildren(header, h("div", { class: "grid cards" }, drills.map(card)), examples);
    observeReveal(el);
  }
  load();
  return { el };
}

export function DrillReportView({ id }) {
  const back = backLink("#/drills", "All drills");
  const el = h("div", { class: "page narrow" }, back, pageHeader("Drill report", "Loading…"), skeletons(1));

  async function load() {
    let data;
    const example = EXAMPLE_DRILLS.find((d) => d.drillId === id);
    try {
      if (example) {
        const { strains } = await api.strains().catch(() => ({ strains: [] }));
        data = { drill: example, strain: strains.find((s) => s.strainId === example.strainId) || null };
      } else data = await api.drill(id);
    } catch (err) {
      el.replaceChildren(back, pageHeader("Drill report"), errorState(err.status === 404 ? "This drill was not found in this browser." : err.message, err.status === 404 ? null : load));
      return;
    }
    const { drill, strain } = data;
    const info = OUTCOME[drill.outcome];
    const link = inviteLink(drill.drillId, drill.shareKey);
    const banner = h(
      "section",
      { class: `card verdict ${info ? info.cls : ""} rise` },
      h("div", { class: "verdict-i" }, icon(drill.outcome === "passed" ? "check" : drill.outcome ? "alert" : "clock")),
      h(
        "div",
        {},
        h("h2", {}, info ? info.label : "Waiting for the call"),
        h("p", {}, info ? `${drill.parentName} ${info.text}` : `${drill.parentName} has not taken the practice call yet. Send them the invitation link.`),
        drill.stepsTotal && drill.outcome ? h("small", { class: "muted" }, `Stopped at step ${drill.stoppedAtStep} of ${drill.stepsTotal}`) : null,
      ),
    );
    el.replaceChildren(
      ...[
        back,
        pageHeader(`Drill for ${drill.parentName}`, `${drill.familyName} \u00b7 ${drill.example ? "example, made up" : "created"} ${fmtDate(drill.createdAt)}`),
        drill.example ? h("p", { class: "banner" }, "This is an example drill. The names are made up; a real report looks exactly like this.") : null,
        banner,
        !drill.outcome || drill.outcome === "aborted"
          ? h("section", { class: "card linkcard" }, h("div", { class: "card-h" }, icon("link"), "Invitation link"), h("div", { class: "linkbox" }, h("code", {}, link)), h("button", { class: "btn primary", type: "button", onClick: () => copyText(link) }, icon("copy"), "Copy the link"))
          : null,
        drill.debriefText ? h("section", { class: "card" }, h("div", { class: "card-h" }, icon("heart"), "What the coach told them"), h("p", { class: "debrief" }, drill.debriefText)) : null,
        strain ? h("div", { class: "section-gap" }, strainCard(strain, { compact: true })) : null,
      ].filter(Boolean),
    );
    observeReveal(el);
  }
  load();
  return { el };
}
