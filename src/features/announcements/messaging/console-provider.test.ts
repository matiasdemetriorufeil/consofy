import { afterEach, describe, expect, it, vi } from "vitest";

import { consoleProvider } from "./console-provider";

describe("consoleProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no abre nada real: devuelve ok con url null", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await consoleProvider.sendToRecipient(
      {
        personId: "p1",
        displayName: "Vecino de prueba",
        phoneE164: "+5493511112223",
      },
      { text: "Hola" },
    );
    expect(result).toEqual({ ok: true, url: null });
  });

  it("imprime el destinatario y el mensaje de forma legible", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await consoleProvider.sendToRecipient(
      {
        personId: "p1",
        displayName: "Vecina de prueba",
        phoneE164: "+5493511112223",
      },
      { text: "Se corta el agua mañana" },
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedText = logSpy.mock.calls[0]![0] as string;
    expect(loggedText).toContain("Vecina de prueba");
    expect(loggedText).toContain("+5493511112223");
    expect(loggedText).toContain("Se corta el agua mañana");
  });
});
