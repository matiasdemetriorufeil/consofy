import { describe, expect, it } from "vitest";

import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  buildDocumentStoragePath,
  canonicalMimeForFilename,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_VISIBILITY_LABEL,
  DOCUMENT_VISIBILITY_VALUES,
  FILE_KIND_LABEL,
  formatFileSize,
  getDocumentDownloadInputSchema,
  getFileExtension,
  getFileKind,
  isDocumentCategory,
  MAX_DOCUMENT_SIZE_BYTES,
  sanitizeFilenameStem,
  setDocumentVisibilityInputSchema,
  validateDocumentFilename,
  validateDocumentSize,
} from "./document-schema";

describe("validateDocumentFilename", () => {
  it("acepta cada extensión permitida (PDF, Word, Excel, imagen)", () => {
    for (const ext of ALLOWED_DOCUMENT_EXTENSIONS) {
      expect(validateDocumentFilename(`documento${ext}`)).toBeNull();
      // Mayúsculas en la extensión también valen.
      expect(
        validateDocumentFilename(`documento${ext.toUpperCase()}`),
      ).toBeNull();
    }
  });

  it("rechaza tipos no permitidos con un mensaje claro", () => {
    for (const name of ["virus.exe", "notas.txt", "archivo.zip", "foto.gif"]) {
      const error = validateDocumentFilename(name);
      expect(error).toContain("no está permitido");
    }
  });

  it("rechaza un archivo sin extensión", () => {
    expect(validateDocumentFilename("balance_marzo")).toContain(
      "no tiene extensión",
    );
  });
});

describe("validateDocumentSize", () => {
  it("acepta un archivo justo en el límite y uno chico", () => {
    expect(validateDocumentSize(MAX_DOCUMENT_SIZE_BYTES)).toBeNull();
    expect(validateDocumentSize(1)).toBeNull();
  });

  it("rechaza un archivo por encima del límite de 10 MB", () => {
    expect(validateDocumentSize(MAX_DOCUMENT_SIZE_BYTES + 1)).toContain(
      "10 MB",
    );
  });

  it("rechaza un archivo vacío", () => {
    expect(validateDocumentSize(0)).toContain("vacío");
    expect(validateDocumentSize(-5)).toContain("vacío");
  });
});

describe("canonicalMimeForFilename", () => {
  it("mapea cada extensión a su Content-Type canónico", () => {
    expect(canonicalMimeForFilename("a.pdf")).toBe("application/pdf");
    expect(canonicalMimeForFilename("a.doc")).toBe("application/msword");
    expect(canonicalMimeForFilename("a.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(canonicalMimeForFilename("a.xls")).toBe("application/vnd.ms-excel");
    expect(canonicalMimeForFilename("a.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(canonicalMimeForFilename("a.jpg")).toBe("image/jpeg");
    expect(canonicalMimeForFilename("a.jpeg")).toBe("image/jpeg");
    expect(canonicalMimeForFilename("a.png")).toBe("image/png");
  });

  it("devuelve null para una extensión no permitida", () => {
    expect(canonicalMimeForFilename("a.txt")).toBeNull();
    expect(canonicalMimeForFilename("sinextension")).toBeNull();
  });
});

describe("getFileExtension", () => {
  it("devuelve la extensión en minúscula, o cadena vacía", () => {
    expect(getFileExtension("Acta.PDF")).toBe(".pdf");
    expect(getFileExtension("balance.final.xlsx")).toBe(".xlsx");
    expect(getFileExtension("sin_extension")).toBe("");
  });
});

describe("sanitizeFilenameStem", () => {
  it("saca tildes, espacios y caracteres raros, y baja a minúsculas", () => {
    expect(sanitizeFilenameStem("Acta Asambléa (Marzo 2026).pdf")).toBe(
      "acta-asamblea-marzo-2026",
    );
  });

  it("colapsa separadores y recorta los de los extremos", () => {
    expect(sanitizeFilenameStem("  --Balance__2025--  .xlsx")).toBe(
      "balance-2025",
    );
  });

  it("cae a un nombre por defecto cuando no queda nada usable", () => {
    expect(sanitizeFilenameStem("…….pdf")).toBe("documento");
  });

  it("recorta a 80 caracteres", () => {
    const long = "a".repeat(200) + ".pdf";
    expect(sanitizeFilenameStem(long).length).toBe(80);
  });
});

describe("buildDocumentStoragePath", () => {
  it("arma {building}/{category}/{uuid}-{nombre}.{ext}", () => {
    const path = buildDocumentStoragePath(
      "11111111-1111-1111-1111-111111111111",
      "minutes",
      "Acta Asambléa.docx",
      "abcd",
    );
    expect(path).toBe(
      "11111111-1111-1111-1111-111111111111/minutes/abcd-acta-asamblea.docx",
    );
  });

  it("conserva la extensión original en minúscula", () => {
    const path = buildDocumentStoragePath("b", "other", "Reporte.PDF", "u");
    expect(path).toBe("b/other/u-reporte.pdf");
  });
});

describe("categorías", () => {
  it("tiene una etiqueta en español para las seis categorías", () => {
    expect(Object.keys(DOCUMENT_CATEGORY_LABEL).sort()).toEqual(
      [...DOCUMENT_CATEGORIES].sort(),
    );
    expect(DOCUMENT_CATEGORIES).toHaveLength(6);
  });

  it("isDocumentCategory distingue valores válidos de inválidos", () => {
    expect(isDocumentCategory("regulations")).toBe(true);
    expect(isDocumentCategory("otros")).toBe(false);
    expect(isDocumentCategory("")).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("formatea bytes, KB y MB", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("getFileKind", () => {
  it("mapea cada mime_type canónico a su clase", () => {
    expect(getFileKind("application/pdf")).toBe("pdf");
    expect(getFileKind("application/msword")).toBe("word");
    expect(
      getFileKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("word");
    expect(getFileKind("application/vnd.ms-excel")).toBe("excel");
    expect(
      getFileKind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("excel");
    expect(getFileKind("image/jpeg")).toBe("image");
    expect(getFileKind("image/png")).toBe("image");
  });

  it("cae a `other` para un mime_type desconocido", () => {
    expect(getFileKind("application/zip")).toBe("other");
    expect(getFileKind("")).toBe("other");
  });

  it("FILE_KIND_LABEL tiene una etiqueta para cada clase", () => {
    for (const kind of ["pdf", "word", "excel", "image", "other"] as const) {
      expect(FILE_KIND_LABEL[kind]).toBeTruthy();
    }
  });
});

describe("visibilidad", () => {
  it("DOCUMENT_VISIBILITY_VALUES espeja el pgEnum (private, residents)", () => {
    expect([...DOCUMENT_VISIBILITY_VALUES].sort()).toEqual([
      "private",
      "residents",
    ]);
  });

  it("DOCUMENT_VISIBILITY_LABEL tiene una etiqueta para cada valor", () => {
    for (const value of DOCUMENT_VISIBILITY_VALUES) {
      expect(DOCUMENT_VISIBILITY_LABEL[value]).toBeTruthy();
    }
    expect(DOCUMENT_VISIBILITY_LABEL.private).toBe("Privado");
    expect(DOCUMENT_VISIBILITY_LABEL.residents).toBe("Visible para vecinos");
  });

  it("setDocumentVisibilityInputSchema acepta un id/valor válidos", () => {
    const parsed = setDocumentVisibilityInputSchema.safeParse({
      documentId: "3f1e8c2a-9b4d-4e6f-8a1b-2c3d4e5f6a7b",
      visibility: "residents",
    });
    expect(parsed.success).toBe(true);
  });

  it("setDocumentVisibilityInputSchema rechaza uuid o valor inválidos", () => {
    expect(
      setDocumentVisibilityInputSchema.safeParse({
        documentId: "no-es-uuid",
        visibility: "residents",
      }).success,
    ).toBe(false);
    expect(
      setDocumentVisibilityInputSchema.safeParse({
        documentId: "3f1e8c2a-9b4d-4e6f-8a1b-2c3d4e5f6a7b",
        visibility: "public",
      }).success,
    ).toBe(false);
  });
});

describe("descarga (paso 10.4)", () => {
  it("getDocumentDownloadInputSchema acepta un uuid válido", () => {
    expect(
      getDocumentDownloadInputSchema.safeParse({
        documentId: "3f1e8c2a-9b4d-4e6f-8a1b-2c3d4e5f6a7b",
      }).success,
    ).toBe(true);
  });

  it("getDocumentDownloadInputSchema rechaza un id que no es uuid o falta", () => {
    expect(
      getDocumentDownloadInputSchema.safeParse({ documentId: "abc" }).success,
    ).toBe(false);
    expect(getDocumentDownloadInputSchema.safeParse({}).success).toBe(false);
  });
});
