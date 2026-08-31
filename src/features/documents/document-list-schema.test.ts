import { describe, expect, it } from "vitest";

import {
  buildDocumentListHref,
  documentListSearchParamsSchema,
  getDocumentPageNumbers,
  hasExplicitDocumentFilters,
} from "./document-list-schema";

describe("documentListSearchParamsSchema", () => {
  it("sin nada: page 1, sin categoría ni búsqueda", () => {
    const parsed = documentListSearchParamsSchema.parse({});
    expect(parsed).toEqual({ page: 1 });
  });

  it("categoría válida pasa; una inválida se descarta (optional)", () => {
    expect(
      documentListSearchParamsSchema.parse({ category: "minutes" }).category,
    ).toBe("minutes");
    const bad = documentListSearchParamsSchema.safeParse({ category: "actas" });
    expect(bad.success).toBe(false);
  });

  it("q de 1 caracter se trata como ausente; de 2+ se conserva", () => {
    expect(documentListSearchParamsSchema.parse({ q: "a" }).q).toBe("");
    expect(documentListSearchParamsSchema.parse({ q: "  balance " }).q).toBe(
      "balance",
    );
  });

  it("page se coacciona a entero positivo, con default 1", () => {
    expect(documentListSearchParamsSchema.parse({ page: "3" }).page).toBe(3);
    expect(
      documentListSearchParamsSchema.safeParse({ page: "0" }).success,
    ).toBe(false);
    expect(
      documentListSearchParamsSchema.safeParse({ page: "-2" }).success,
    ).toBe(false);
  });
});

describe("hasExplicitDocumentFilters", () => {
  it("false sin categoría ni búsqueda (aunque haya page)", () => {
    expect(hasExplicitDocumentFilters({})).toBe(false);
    expect(hasExplicitDocumentFilters({ q: "" })).toBe(false);
    expect(
      hasExplicitDocumentFilters({ category: undefined, q: undefined }),
    ).toBe(false);
  });

  it("true si hay categoría o búsqueda real", () => {
    expect(hasExplicitDocumentFilters({ category: "insurance" })).toBe(true);
    expect(hasExplicitDocumentFilters({ q: "balance" })).toBe(true);
  });
});

describe("buildDocumentListHref", () => {
  it("agrega, pisa y borra (null) parámetros conservando el resto", () => {
    expect(
      buildDocumentListHref(
        "/panel/documents",
        { category: "minutes", page: "2" },
        { page: "3" },
      ),
    ).toBe("/panel/documents?category=minutes&page=3");

    expect(
      buildDocumentListHref(
        "/panel/documents",
        { category: "minutes", page: "3" },
        { page: null },
      ),
    ).toBe("/panel/documents?category=minutes");

    expect(buildDocumentListHref("/panel/documents", {}, { page: null })).toBe(
      "/panel/documents",
    );
  });
});

describe("getDocumentPageNumbers", () => {
  it("lista todas las páginas cuando son pocas (<=7)", () => {
    expect(getDocumentPageNumbers(1, 1)).toEqual([1]);
    expect(getDocumentPageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getDocumentPageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("intercala '…' con muchas páginas", () => {
    expect(getDocumentPageNumbers(1, 20)).toEqual([1, 2, "ellipsis", 20]);
    expect(getDocumentPageNumbers(10, 20)).toEqual([
      1,
      "ellipsis",
      9,
      10,
      11,
      "ellipsis",
      20,
    ]);
    expect(getDocumentPageNumbers(20, 20)).toEqual([1, "ellipsis", 19, 20]);
  });
});
