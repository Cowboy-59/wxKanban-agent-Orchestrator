// SCOPE-106 / T016 — unit tests for the Borrow-a-Look Business Template building blocks:
// chrome renderers, the SSRF guard (security-critical), and the capture→prompt context.
import { describe, it, expect } from "vitest";
import {
  renderHeaderComponent,
  renderFooterComponent,
  DEFAULT_BUSINESS_CHROME,
  type BusinessChrome,
} from "../../src/shared/theme-template";
import { WXKANBAN_DEFAULT_THEME } from "../../src/shared/theme-tokens";
import {
  isPrivateAddress,
  captureToPromptContext,
  type SiteStyleCapture,
} from "../../src/server/services/SiteStyleCaptureService";

const theme = WXKANBAN_DEFAULT_THEME;

describe("business chrome renderers (FR-005/006)", () => {
  const chrome: BusinessChrome = {
    logoRef: "https://cdn.example.com/logo.png",
    appName: "Acme Inc.",
    footerLine: "© 2026 Acme Inc.",
  };

  it("renders a Header component with the app name embedded as a string literal", () => {
    const out = renderHeaderComponent(chrome, theme);
    expect(out).toContain("export function Header()");
    expect(out).toContain(JSON.stringify("Acme Inc."));
    // theme-driven, not hard-coded colors
    expect(out).toContain("bg-background");
    expect(out).toContain("text-foreground");
  });

  it("includes the logo img only when a logoRef is present", () => {
    expect(renderHeaderComponent(chrome, theme)).toContain("https://cdn.example.com/logo.png");
    const noLogo = renderHeaderComponent({ ...chrome, logoRef: null }, theme);
    expect(noLogo).not.toContain("<img");
  });

  it("renders a Footer component with the footer line, theme-styled", () => {
    const out = renderFooterComponent(chrome, theme);
    expect(out).toContain("export function Footer()");
    expect(out).toContain(JSON.stringify("© 2026 Acme Inc."));
    expect(out).toContain("border-border");
  });

  it("safely embeds hostile text without breaking the generated source", () => {
    const nasty: BusinessChrome = {
      logoRef: null,
      appName: '"; alert(1); //',
      footerLine: "</footer>",
    };
    const header = renderHeaderComponent(nasty, theme);
    // The value is JSON-encoded, so the raw injection substring is not emitted verbatim.
    expect(header).toContain(JSON.stringify('"; alert(1); //'));
    expect(renderFooterComponent(nasty, theme)).toContain(JSON.stringify("</footer>"));
  });

  it("DEFAULT_BUSINESS_CHROME is empty and complete", () => {
    expect(DEFAULT_BUSINESS_CHROME).toEqual({ logoRef: null, appName: "", footerLine: "" });
  });
});

describe("SSRF guard — isPrivateAddress (security)", () => {
  it("blocks loopback, private, and cloud-metadata ranges", () => {
    for (const addr of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254", // AWS instance metadata — the important one
      "::1",
      "fc00::1",
      "fe80::1",
      "0.0.0.0",
    ]) {
      expect(isPrivateAddress(addr), addr).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const addr of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateAddress(addr), addr).toBe(false);
    }
  });
});

describe("captureToPromptContext (FR-002)", () => {
  const base: SiteStyleCapture = {
    url: "https://example.com",
    method: "headless",
    backgroundColor: "rgb(255, 255, 255)",
    textColor: "rgb(15, 23, 42)",
    primaryColor: "rgb(79, 70, 229)",
    primaryTextColor: "rgb(255, 255, 255)",
    borderColor: "rgb(226, 232, 240)",
    radius: "8px",
    fontFamilies: ["Inter, sans-serif"],
    cssVars: { "--brand": "#4f46e5" },
    palette: ["rgb(79, 70, 229)", "rgb(255, 255, 255)"],
  };

  it("includes the url, method and observed values", () => {
    const ctx = captureToPromptContext(base);
    expect(ctx).toContain("https://example.com");
    expect(ctx).toContain("headless");
    expect(ctx).toContain("rgb(79, 70, 229)");
    expect(ctx).toContain("Inter, sans-serif");
    expect(ctx).toContain("8px");
  });

  it("omits absent fields cleanly (no empty lines)", () => {
    const sparse: SiteStyleCapture = {
      url: "https://x.io",
      method: "static",
      backgroundColor: null,
      textColor: null,
      primaryColor: null,
      primaryTextColor: null,
      borderColor: null,
      radius: null,
      fontFamilies: [],
      cssVars: {},
      palette: [],
    };
    const ctx = captureToPromptContext(sparse);
    expect(ctx).toContain("https://x.io");
    expect(ctx.split("\n").every((l) => l.trim().length > 0)).toBe(true);
  });
});
