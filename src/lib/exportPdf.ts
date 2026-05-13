import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PropertyAnalysis } from "./types";
import {
  berekenMaxBod,
  berekenRenovatiekosten,
  fmtEUR,
  fmtPct,
  maxBodBreakdown,
  ovbTarief,
} from "./calculations";

const NAVY: [number, number, number] = [15, 27, 61];
const GRAY: [number, number, number] = [110, 110, 120];
const LINE: [number, number, number] = [220, 220, 225];

const PAGE_W = 210;
const MARGIN = 18;

function adviesLabel(advies: string): string {
  if (advies === "Kopen") return "Sterke koop";
  if (advies === "Vermijden") return "Vermijden";
  return "Voorwaardelijk";
}

function safeFile(s: string): string {
  return s.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function dateNL(d = new Date()): string {
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

function dateFile(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("VastgoedAI", MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(dateNL(), PAGE_W - MARGIN, 12, { align: "right" });
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, MARGIN, 32);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text(subtitle, MARGIN, 38);
  }
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, 42, PAGE_W - MARGIN, 42);
  doc.setTextColor(0, 0, 0);
}

function footer(doc: jsPDF, page: number, total: number) {
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(
    `VastgoedAI investeringsdossier  ·  Pagina ${page} van ${total}`,
    PAGE_W / 2,
    287,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);
}

function kvRows(rows: [string, string][]) {
  return rows.filter(([, v]) => v !== "" && v !== "—" && v != null);
}

export function exportAnalysisPdf(a: PropertyAnalysis) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const adres = a.pdok?.adres ?? a.input;
  const woon = a.pdok?.woonplaats ?? "";

  // ---- PAGE 1: Voorblad
  header(doc, "Investeringsdossier", woon);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  const adresLines = doc.splitTextToSize(adres, PAGE_W - MARGIN * 2);
  doc.text(adresLines, MARGIN, 56);

  let y = 56 + adresLines.length * 8 + 4;

  const m2 = a.listing?.m2 ?? a.bag?.oppervlakte ?? a.altum?.oppervlakte;
  const bouwjaar = a.bag?.bouwjaar ?? a.listing?.bouwjaar;
  const label = a.energielabel?.label ?? a.listing?.energielabel ?? "—";

  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2 },
    body: kvRows([
      ["Pandtype", String(a.pandtype)],
      ["Oppervlakte", m2 ? `${m2} m²` : "—"],
      ["Kamers", a.listing?.kamers ? String(a.listing.kamers) : "—"],
      ["Bouwjaar", bouwjaar ? String(bouwjaar) : "—"],
      ["Energielabel", label],
    ]),
    columnStyles: { 0: { textColor: GRAY, cellWidth: 50 }, 1: { fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error lastAutoTable injected by autotable
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Score block
  const ring = a.ai.score >= 7 ? [16, 122, 70] : a.ai.score >= 5 ? [180, 130, 20] : [180, 40, 40];
  doc.setFillColor(245, 245, 248);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 36, "F");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("INVESTERINGSSCORE", MARGIN + 6, y + 8);
  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(ring[0], ring[1], ring[2]);
  doc.text(`${a.ai.score}`, MARGIN + 6, y + 28);
  doc.setFontSize(12);
  doc.setTextColor(...GRAY);
  doc.text("/ 10", MARGIN + 32, y + 28);

  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("VERDICT", MARGIN + 80, y + 8);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(adviesLabel(a.ai.advies), MARGIN + 80, y + 22);

  y += 44;

  // Financials
  const vraag = a.listing?.prijs;
  const reno = berekenRenovatiekosten(a);
  const eigenGebruik = a.pandtype === "woning";
  const maxBod = berekenMaxBod(a, 10, reno.totaal, eigenGebruik);

  autoTable(doc, {
    startY: y,
    head: [["Kerncijfers", "Bedrag"]],
    body: [
      ["Vraagprijs", fmtEUR(vraag)],
      ["Marktwaarde (AI)", fmtEUR(a.ai.marktwaarde_ai)],
      ["Maximaal bod (10% ROI)", fmtEUR(maxBod)],
      [a.pandtype === "commercieel" ? "Markthuur (jaar)" : "Markthuur (maand)", fmtEUR(a.ai.huurwaarde_ai)],
    ],
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ---- PAGE 2: Investeringsthese
  doc.addPage();
  header(doc, "Investeringsthese & risico", adres);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("AI-investeringsthese", MARGIN, 52);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  const these = doc.splitTextToSize(a.ai.investeringsthese || "—", PAGE_W - MARGIN * 2);
  doc.text(these, MARGIN, 58);
  let y2 = 58 + these.length * 5 + 6;

  if (a.ai.marktcontext) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("Marktcontext", MARGIN, y2);
    y2 += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    const mc = doc.splitTextToSize(a.ai.marktcontext, PAGE_W - MARGIN * 2);
    doc.text(mc, MARGIN, y2);
    y2 += mc.length * 5 + 6;
  }

  // Risico tabel met visuele balk
  autoTable(doc, {
    startY: y2,
    head: [["Risicofactor", "Score", "Niveau"]],
    body: [
      ["Locatie", `${a.ai.risico.locatie}/10`, "█".repeat(a.ai.risico.locatie)],
      ["Staat", `${a.ai.risico.staat}/10`, "█".repeat(a.ai.risico.staat)],
      ["Markt", `${a.ai.risico.markt}/10`, "█".repeat(a.ai.risico.markt)],
      ["Liquiditeit", `${a.ai.risico.liquiditeit}/10`, "█".repeat(a.ai.risico.liquiditeit)],
    ],
    headStyles: { fillColor: NAVY, textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 2: { textColor: NAVY } },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error
  y2 = (doc.lastAutoTable?.finalY ?? y2) + 8;

  const afwijking = vraag ? ((a.ai.marktwaarde_ai - vraag) / vraag) * 100 : 0;
  autoTable(doc, {
    startY: y2,
    head: [["Prijs-validatie", ""]],
    body: [
      ["Vraagprijs", fmtEUR(vraag)],
      ["Marktwaarde (AI)", fmtEUR(a.ai.marktwaarde_ai)],
      ["Afwijking", vraag ? fmtPct(afwijking) : "—"],
    ],
    headStyles: { fillColor: NAVY, textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error
  y2 = (doc.lastAutoTable?.finalY ?? y2) + 8;

  if (a.ai.opmerkingen?.length) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.setFontSize(10);
    doc.text("Opmerkingen & waarschuwingen", MARGIN, y2);
    y2 += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    a.ai.opmerkingen.forEach((o) => {
      const ls = doc.splitTextToSize(`• ${o}`, PAGE_W - MARGIN * 2);
      doc.text(ls, MARGIN, y2 + 4);
      y2 += ls.length * 5 + 2;
    });
  }

  // ---- PAGE 3: Kadaster & Data
  doc.addPage();
  header(doc, "Kadaster & data", adres);

  autoTable(doc, {
    startY: 50,
    head: [["BAG-gegevens", "Waarde"]],
    body: kvRows([
      ["Adres", a.pdok?.adres ?? "—"],
      ["Postcode", a.pdok?.postcode ?? "—"],
      ["Woonplaats", a.pdok?.woonplaats ?? "—"],
      ["Gemeente", a.pdok?.gemeente ?? "—"],
      ["Buurt", a.pdok?.buurt ?? "—"],
      ["BAG ID", a.pdok?.bagId ?? "—"],
      ["Oppervlakte (BAG)", a.bag?.oppervlakte ? `${a.bag.oppervlakte} m²` : "—"],
      ["Bouwjaar (BAG)", a.bag?.bouwjaar ? String(a.bag.bouwjaar) : "—"],
      ["Gebruiksdoel", a.bag?.gebruiksdoel ?? "—"],
      ["Status", a.bag?.status ?? "—"],
      ["Aantal verblijfsobjecten", a.bag?.vbos ? String(a.bag.vbos) : "—"],
      ["Perceel", a.perceel_m2 ? `${a.perceel_m2} m²` : "—"],
      ["Rijksmonument", a.monument?.rijksmonument ? "Ja" : "Nee"],
      ["Beschermd stadsgezicht", a.monument?.beschermdGezicht ?? "Nee"],
    ]),
    headStyles: { fillColor: NAVY, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { textColor: GRAY, cellWidth: 70 }, 1: { fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error
  let y3 = (doc.lastAutoTable?.finalY ?? 50) + 6;

  if (a.woz?.length) {
    autoTable(doc, {
      startY: y3,
      head: [["Jaar", "WOZ-waarde"]],
      body: a.woz.map((w) => [String(w.jaar), fmtEUR(w.waarde)]),
      headStyles: { fillColor: NAVY, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      margin: { left: MARGIN, right: MARGIN },
    });
    // @ts-expect-error
    y3 = (doc.lastAutoTable?.finalY ?? y3) + 6;
  }

  autoTable(doc, {
    startY: y3,
    head: [["Energielabel", "Detail"]],
    body: kvRows([
      ["Definitief label", a.energielabel?.label ?? "—"],
      ["Bron", a.energielabel?.bron ?? "—"],
      ["Secundair label", a.energielabel?.label_secondary ?? ""],
      ["Conflict", a.energielabel?.conflict ? "Ja" : "Nee"],
    ]),
    headStyles: { fillColor: NAVY, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { textColor: GRAY, cellWidth: 70 }, 1: { fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ---- PAGE 4: Aankoop & rendement
  doc.addPage();
  header(doc, "Aankoop & rendement", adres);

  const bd = maxBodBreakdown(a, 10, reno.totaal, eigenGebruik);
  const ovbPct = ovbTarief(a.pandtype, eigenGebruik);
  const aankoopBod = vraag ?? a.ai.marktwaarde_ai;
  const ovb = Math.round(aankoopBod * (ovbPct / 100));
  const bijkomend = 1500 + 700 + 550 + 2500;

  autoTable(doc, {
    startY: 50,
    head: [["Aankoopkosten (op basis van vraagprijs)", "Bedrag"]],
    body: [
      ["Aankoopprijs", fmtEUR(aankoopBod)],
      [`Overdrachtsbelasting (${ovbPct}%)`, fmtEUR(ovb)],
      ["Notaris", fmtEUR(1500)],
      ["Taxatie", fmtEUR(700)],
      ["Bouwkundige keuring", fmtEUR(550)],
      ["Overig (financiering e.d.)", fmtEUR(2500)],
      ["Totaal aankoopsom", fmtEUR(aankoopBod + ovb + bijkomend)],
    ],
    headStyles: { fillColor: NAVY, textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error
  let y4 = (doc.lastAutoTable?.finalY ?? 50) + 6;

  autoTable(doc, {
    startY: y4,
    head: [["Maximaal bod (10% ROI-buffer)", "Bedrag"]],
    body: [
      ["Marktwaarde (basis)", fmtEUR(bd.marktwaarde)],
      ["− Renovatiekosten", `−${fmtEUR(bd.renovatie)}`],
      [`− OVB (${bd.ovbPct}%)`, `−${fmtEUR(bd.ovb)}`],
      ["− Notaris/taxatie/keuring", `−${fmtEUR(bd.bijkomend)}`],
      [`− ROI-buffer (${bd.gewensteROI}% × marktwaarde)`, `−${fmtEUR(bd.roiKorting)}`],
      ["Maximaal bod", fmtEUR(bd.bod)],
    ],
    headStyles: { fillColor: NAVY, textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error
  y4 = (doc.lastAutoTable?.finalY ?? y4) + 6;

  // Exit KPIs
  const factor = a.pandtype === "commercieel" ? 0.6 : 0.7;
  const arv = a.ai.marktwaarde_ai + Math.round(reno.totaal * factor);
  const totaalInv = aankoopBod + reno.totaal + 15000;
  const makelaar = Math.round(arv * 0.015);
  const winst = arv - totaalInv - makelaar - 2500;
  const roiVerk = (winst / totaalInv) * 100;

  const maandhuur = a.ai.huurwaarde_ai || 1500;
  const jaarhuur = maandhuur * 12 * 0.95;
  const cashFlow = jaarhuur - 2500;
  const terugverdien = aankoopBod / Math.max(1, cashFlow);

  autoTable(doc, {
    startY: y4,
    head: [["Exitstrategie KPI's", "Waarde"]],
    body: [
      ["ARV (na renovatie)", fmtEUR(arv)],
      ["Totaal geïnvesteerd", fmtEUR(totaalInv)],
      ["Nettowinst (verkoop)", fmtEUR(winst)],
      ["ROI (verkoop)", fmtPct(roiVerk)],
      ["Bruto jaarhuur (verhuur)", fmtEUR(jaarhuur)],
      ["Terugverdientijd (verhuur)", `${terugverdien.toFixed(1)} jaar`],
    ],
    headStyles: { fillColor: NAVY, textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  // Footers
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    footer(doc, i, total);
  }

  const filename = `VastgoedAI-${safeFile(adres || "dossier")}-${dateFile()}.pdf`;
  doc.save(filename);
}
