import { describe, expect, it } from "vitest";

import {
  formatStorageSize,
  resolveStorageQuota,
  STORAGE_QUOTA_LIMIT_BYTES,
  STORAGE_QUOTA_WARNING_RATIO,
} from "./storage-quota";

describe("resolveStorageQuota (paso 10.6)", () => {
  it("proyecto vacío: ratio 0, 0%, sin aviso", () => {
    const q = resolveStorageQuota(0);
    expect(q).toMatchObject({
      usedBytes: 0,
      limitBytes: STORAGE_QUOTA_LIMIT_BYTES,
      ratio: 0,
      percent: 0,
      isWarning: false,
    });
  });

  it("un valor negativo (no debería pasar) se trata como 0", () => {
    expect(resolveStorageQuota(-500).usedBytes).toBe(0);
    expect(resolveStorageQuota(-500).isWarning).toBe(false);
  });

  it("a la mitad del límite: 50%, sin aviso", () => {
    const q = resolveStorageQuota(STORAGE_QUOTA_LIMIT_BYTES / 2);
    expect(q.ratio).toBeCloseTo(0.5);
    expect(q.percent).toBe(50);
    expect(q.isWarning).toBe(false);
  });

  it("justo en el 80% se activa el aviso (umbral inclusivo)", () => {
    const q = resolveStorageQuota(
      STORAGE_QUOTA_WARNING_RATIO * STORAGE_QUOTA_LIMIT_BYTES,
    );
    expect(q.percent).toBe(80);
    expect(q.isWarning).toBe(true);
  });

  it("claramente por debajo del umbral (70%) no avisa", () => {
    const q = resolveStorageQuota(0.7 * STORAGE_QUOTA_LIMIT_BYTES);
    expect(q.percent).toBe(70);
    expect(q.isWarning).toBe(false);
  });

  it("`percent` e `isWarning` nunca se contradicen (el aviso sigue al número que se muestra)", () => {
    // Un conteo de bytes ENTERO justo por debajo de 0,8*límite: el ratio
    // crudo es 0,79999... pero se redondea a 80% en pantalla. El aviso
    // tiene que seguir a ese 80%, no quedar apagado por el ratio crudo.
    const almost = Math.round(
      STORAGE_QUOTA_WARNING_RATIO * STORAGE_QUOTA_LIMIT_BYTES,
    );
    const q = resolveStorageQuota(almost);
    expect(q.ratio).toBeLessThan(STORAGE_QUOTA_WARNING_RATIO);
    expect(q.percent).toBe(80);
    expect(q.isWarning).toBe(true);

    for (let pct = 0; pct <= 130; pct += 1) {
      const sweep = resolveStorageQuota(
        Math.round((pct / 100) * STORAGE_QUOTA_LIMIT_BYTES),
      );
      expect(sweep.isWarning).toBe(sweep.percent >= 80);
    }
  });

  it("por encima del límite: ratio y porcentaje pasan de 100, con aviso", () => {
    const q = resolveStorageQuota(STORAGE_QUOTA_LIMIT_BYTES * 1.5);
    expect(q.ratio).toBeCloseTo(1.5);
    expect(q.percent).toBe(150);
    expect(q.isWarning).toBe(true);
  });
});

describe("formatStorageSize (paso 10.6)", () => {
  it("delega en formatFileSize (paso 10.2) por debajo de 1 GB", () => {
    expect(formatStorageSize(0)).toBe("0 B");
    expect(formatStorageSize(512)).toBe("512 B");
    expect(formatStorageSize(5 * 1024)).toBe("5 KB");
    expect(formatStorageSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("agrega el tramo GB, con dos decimales", () => {
    expect(formatStorageSize(STORAGE_QUOTA_LIMIT_BYTES)).toBe("1.00 GB");
    expect(formatStorageSize(2 * 1024 ** 3)).toBe("2.00 GB");
    expect(formatStorageSize(Math.round(1.5 * 1024 ** 3))).toBe("1.50 GB");
  });
});
