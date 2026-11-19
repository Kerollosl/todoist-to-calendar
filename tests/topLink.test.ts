import { describe, expect, it } from "vitest";
import { normalizeLinkText, normalizeLinkUrl, topLinkView } from "../src/core/topLink";

describe("normalizeLinkUrl", () => {
  it("adds https to bare hosts", () => {
    expect(normalizeLinkUrl("example.com/path")).toBe("https://example.com/path");
  });
  it("keeps http(s) URLs", () => {
    expect(normalizeLinkUrl(" http://a.b/c?d=1 ")).toBe("http://a.b/c?d=1");
    expect(normalizeLinkUrl("https://app.todoist.com/app/today")).toBe("https://app.todoist.com/app/today");
  });
  it("rejects other schemes and junk", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBe("");
    expect(normalizeLinkUrl("data:text/html,hi")).toBe("");
    expect(normalizeLinkUrl("file:///etc/passwd")).toBe("");
    expect(normalizeLinkUrl("")).toBe("");
    expect(normalizeLinkUrl("   ")).toBe("");
    expect(normalizeLinkUrl("http://")).toBe("");
    expect(normalizeLinkUrl(42)).toBe("");
  });
});

describe("normalizeLinkText", () => {
  it("collapses whitespace and caps length", () => {
    expect(normalizeLinkText("  Focus \n board ")).toBe("Focus board");
    expect(normalizeLinkText("x".repeat(100))).toHaveLength(60);
    expect(normalizeLinkText(null)).toBe("");
  });
});

describe("topLinkView", () => {
  it("is off without a valid URL", () => {
    expect(topLinkView("", "Hi")).toBeNull();
    expect(topLinkView("javascript:void 0", "Hi")).toBeNull();
  });
  it("falls back to the hostname for the label", () => {
    expect(topLinkView("www.example.com/x", "")).toEqual({ href: "https://www.example.com/x", label: "example.com" });
  });
  it("uses the custom text", () => {
    expect(topLinkView("example.com", "My board")).toEqual({ href: "https://example.com/", label: "My board" });
  });
});
